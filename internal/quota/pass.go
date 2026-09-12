package quota

// 通行码：后台生成、发给用户，解读请求带上它即放行
//
// 两种码：不限次的码带着就一直能解读；次数码带一个次数池，每次解读扣一次，扣完失效。
// 码不绑定客户端，谁持有谁能用，一把次数 10 的码可以一个人用十次，也可以十个人各用一次。
// 带了有效的码就跳过指纹与 IP 两层额度，只对白名单开放期间也照样放行；用码的解读仍然
// 记进两层用量，后台看得到量，只是不参与判定

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"
)

// 通行码的两种类型
const (
	// PassAllow 不限次，带着就一直能解读
	PassAllow = "allow"
	// PassTimes 带一个次数池，每次解读扣一次，扣完失效
	PassTimes = "times"
)

// 码的字符集与长度：去掉了容易看混的 0O1IL，十六位约有 79 位熵，猜不出来
const (
	passAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
	passCodeLen  = 16
)

// 生成通行码时的取值范围
const (
	passTimesMax = 100000
	passCountMax = 100
	// passNoteMaxRunes 备注的长度上限
	passNoteMaxRunes = 200
	// passClientsMax 一把码最多记下几个用过它的客户端，够看出散给了多少人
	passClientsMax = 20
)

// bucketPasses 通行码按码存整条记录
var bucketPasses = []byte("passes")

// 通行码不可用的几种情形
var (
	// ErrPassNotFound 码不存在
	ErrPassNotFound = errors.New("通行码无效")
	// ErrPassDisabled 码已被后台作废
	ErrPassDisabled = errors.New("通行码已作废")
	// ErrPassUsedUp 次数码的次数已用完
	ErrPassUsedUp = errors.New("通行码的次数已用完")
)

// Pass 一把通行码
type Pass struct {
	Code string `json:"code"`
	Kind string `json:"kind"`
	// Times 次数池的总数，不限次的码为 0
	Times int `json:"times"`
	// Used 已消耗的次数
	Used int    `json:"used"`
	Note string `json:"note,omitempty"`
	// Disabled 后台作废，作废后一律拒绝
	Disabled  bool      `json:"disabled,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	// LastAt 最近一次用它解读的时刻，没用过是零值
	LastAt time.Time `json:"lastAt"`
	// LastIP 最近一次用它的来源 IP
	LastIP string `json:"lastIp,omitempty"`
	// LastUserAgent 最近一次用它的 UA
	LastUserAgent string `json:"lastUserAgent,omitempty"`
	// Clients 用过它的客户端主体键，去重后最多留 passClientsMax 个
	Clients []string `json:"clients,omitempty"`
	// Tokens 这把码累计的模型用量
	Tokens Tokens `json:"tokens"`
}

// Left 次数码的剩余次数，不限次的码返回 -1
func (p Pass) Left() int {
	if p.Kind == PassAllow {
		return -1
	}
	return max(p.Times-p.Used, 0)
}

// Usable 这把码当下能不能用，不能用时说明缘由
func (p Pass) Usable() error {
	if p.Code == "" {
		return ErrPassNotFound
	}
	if p.Disabled {
		return ErrPassDisabled
	}
	if p.Kind == PassTimes && p.Used >= p.Times {
		return ErrPassUsedUp
	}
	return nil
}

// PassDraft 生成通行码的参数
type PassDraft struct {
	Kind string
	// Times 次数池的大小，不限次的码忽略这一项
	Times int
	// Count 这次生成几把
	Count int
	Note  string
}

// Validate 校验生成参数
func (d PassDraft) Validate() error {
	if d.Kind != PassAllow && d.Kind != PassTimes {
		return fmt.Errorf("通行码类型应为 %q 或 %q，收到 %q", PassAllow, PassTimes, d.Kind)
	}
	if d.Kind == PassTimes && (d.Times < 1 || d.Times > passTimesMax) {
		return fmt.Errorf("次数应在 1 到 %d 之间，收到 %d", passTimesMax, d.Times)
	}
	if d.Count < 1 || d.Count > passCountMax {
		return fmt.Errorf("一次最多生成 %d 把，收到 %d", passCountMax, d.Count)
	}
	if len([]rune(d.Note)) > passNoteMaxRunes {
		return fmt.Errorf("备注最长 %d 个字符", passNoteMaxRunes)
	}
	return nil
}

// NormalizePass 规范化用户输入的码：丢掉分隔符与空白，小写转大写
func NormalizePass(raw string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(raw) {
		if strings.ContainsRune(passAlphabet, r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// newPassCode 随机生成一个码
func newPassCode() string {
	raw := make([]byte, passCodeLen)
	// crypto/rand 在 Go 1.24 起不会失败，读满即可
	_, _ = rand.Read(raw)

	code := make([]byte, passCodeLen)
	for index, value := range raw {
		code[index] = passAlphabet[int(value)%len(passAlphabet)]
	}
	return string(code)
}

// PassPage 一页通行码与总数
type PassPage struct {
	Total int
	Items []Pass
}

// NewPasses 生成一批通行码并存下来
func (s *Store) NewPasses(draft PassDraft) ([]Pass, error) {
	if err := draft.Validate(); err != nil {
		return nil, err
	}

	now := time.Now()
	passes := make([]Pass, 0, draft.Count)
	err := s.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket(bucketPasses)
		for len(passes) < draft.Count {
			code := newPassCode()
			// 撞上已有的码就换一个，十六位下几乎不会发生
			if bucket.Get([]byte(code)) != nil {
				continue
			}

			pass := Pass{
				Code:      code,
				Kind:      draft.Kind,
				Note:      strings.TrimSpace(draft.Note),
				CreatedAt: now,
			}
			if draft.Kind == PassTimes {
				pass.Times = draft.Times
			}
			if err := writePass(tx, pass); err != nil {
				return err
			}
			passes = append(passes, pass)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return passes, nil
}

// Pass 取一把码，不存在返回 ErrPassNotFound
func (s *Store) Pass(code string) (pass Pass, err error) {
	code = NormalizePass(code)
	err = s.db.View(func(tx *bolt.Tx) error {
		pass, err = readPass(tx, code)
		if err != nil {
			return err
		}
		if pass.Code == "" {
			return ErrPassNotFound
		}
		return nil
	})
	return
}

// CheckPass 校验一把码当下能不能用，能用则返回它
func (s *Store) CheckPass(code string) (Pass, error) {
	pass, err := s.Pass(code)
	if err != nil {
		return Pass{}, err
	}
	return pass, pass.Usable()
}

// ConsumePass 扣一次并记下用码的客户端
//
// 校验与消耗分开：上游开始生成才算消耗一次，中途断开不退。并发下最后一次可能被多扣，
// 差额最多一次，下一次校验照样拦得住
func (s *Store) ConsumePass(code string, entry Entry) error {
	return s.updatePass(code, func(pass *Pass) {
		now := time.Now()
		pass.Used++
		pass.LastAt = now
		pass.LastIP = entry.IP
		pass.LastUserAgent = entry.UserAgent

		client := entry.Key.String()
		if client != "" && !slices.Contains(pass.Clients, client) && len(pass.Clients) < passClientsMax {
			pass.Clients = append(pass.Clients, client)
		}
	})
}

// AddPassTokens 把一次调用的模型用量累加到码上，流结束才知道用了多少，所以与 ConsumePass 分开
func (s *Store) AddPassTokens(code string, tokens Tokens) error {
	if tokens.Empty() {
		return nil
	}
	return s.updatePass(code, func(pass *Pass) {
		pass.Tokens.Add(tokens)
	})
}

// SetPassDisabled 作废或恢复一把码，返回它改动后的样子
func (s *Store) SetPassDisabled(code string, disabled bool) (Pass, error) {
	if err := s.updatePass(code, func(pass *Pass) {
		pass.Disabled = disabled
	}); err != nil {
		return Pass{}, err
	}
	return s.Pass(code)
}

// ListPasses 按生成时间倒序分页列出全部通行码
func (s *Store) ListPasses(offset, limit int) (PassPage, error) {
	var page PassPage
	err := s.db.View(func(tx *bolt.Tx) error {
		var all []Pass
		err := tx.Bucket(bucketPasses).ForEach(func(_, raw []byte) error {
			var pass Pass
			if unmarshalErr := json.Unmarshal(raw, &pass); unmarshalErr != nil {
				return unmarshalErr
			}
			all = append(all, pass)
			return nil
		})
		if err != nil {
			return err
		}

		slices.SortFunc(all, func(a, b Pass) int {
			if c := b.CreatedAt.Compare(a.CreatedAt); c != 0 {
				return c
			}
			return strings.Compare(a.Code, b.Code)
		})

		page.Total = len(all)
		if offset < len(all) {
			page.Items = all[offset:min(offset+limit, len(all))]
		}
		return nil
	})
	return page, err
}

// updatePass 读出一把码，就地改完写回；码不存在时返回 ErrPassNotFound
func (s *Store) updatePass(code string, mutate func(pass *Pass)) error {
	code = NormalizePass(code)
	return s.db.Update(func(tx *bolt.Tx) error {
		pass, err := readPass(tx, code)
		if err != nil {
			return err
		}
		if pass.Code == "" {
			return ErrPassNotFound
		}

		mutate(&pass)
		return writePass(tx, pass)
	})
}

// readPass 在事务内读一把码，没有记录时返回零值
func readPass(tx *bolt.Tx, code string) (pass Pass, err error) {
	raw := tx.Bucket(bucketPasses).Get([]byte(code))
	if raw == nil {
		return
	}
	err = json.Unmarshal(raw, &pass)
	return
}

// writePass 在事务内写一把码
func writePass(tx *bolt.Tx, pass Pass) error {
	raw, err := json.Marshal(pass)
	if err != nil {
		return err
	}
	return tx.Bucket(bucketPasses).Put([]byte(pass.Code), raw)
}
