// Package quota 免费解读次数的配额
//
// 解读要花上游的钱，按客户端限次。配额分两层：浏览器指纹是主闸，额度小，正常用户只会
// 撞这一道；来源 IP 是兜底阀，额度大，挡的是同一出口下反复换无痕窗口的量，共享出口的
// 正常用户撞不到。两道都过才放行。窗口是滚动的，每次调用的时刻都记下来，窗口外的在写入
// 时裁掉。额度、窗口与黑白名单都由后台改，存在同一个数据文件里，改完立刻生效不必重启；
// 每次调用的 tokens 用量按主体累计，后台据此看得到花销。
// 另有一路通行码（pass.go），带上有效的码即跳过这两层额度
package quota

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
)

// 配额主体的类型
const (
	// KindClient 浏览器指纹，取不到指纹时退化成由 IP 派生，即整个 IP 当一个客户端
	KindClient = "client"
	// KindIP 来源 IP
	KindIP = "ip"
)

// 后台对某个主体的处置
const (
	// RuleNone 按额度限次
	RuleNone = ""
	// RuleAllow 白名单，不限次
	RuleAllow = "allow"
	// RuleBlock 拉黑，一律拒绝
	RuleBlock = "block"
)

// 默认额度与窗口
const (
	defaultClientLimit = 3
	defaultIPLimit     = 20
	defaultWindow      = 24 * time.Hour
)

// 存储桶：quota 按主体键存用量与处置，quotaconfig 存后台改过的额度
var (
	bucketUsage    = []byte("quota")
	bucketSettings = []byte("quotaconfig")
)

// keyLimits 额度在设置桶里的键
var keyLimits = []byte("limits")

// ErrBlocked 主体被后台拉黑
var ErrBlocked = errors.New("已被限制使用")

// ErrNotWhitelisted 只对白名单开放期间，主体不在白名单
var ErrNotWhitelisted = errors.New("不在白名单内")

// LimitError 配额耗尽，带上是哪一层的额度与多久之后能再试
type LimitError struct {
	Kind  string
	Limit int
	// RetryAfter 最早的那次调用滑出窗口还要多久
	RetryAfter time.Duration
}

func (e LimitError) Error() string {
	return fmt.Sprintf("免费解读次数已用完，%s后可再试", roundUpHour(e.RetryAfter))
}

// Key 一个配额主体
type Key struct {
	Kind  string
	Value string
}

// String 存储里的键，形如 `client:xxxx`
func (k Key) String() string {
	return k.Kind + ":" + k.Value
}

// ClientKey 浏览器指纹的主体；指纹为空时退化成由 IP 派生
func ClientKey(fingerprint, ip string) Key {
	if fingerprint == "" {
		return Key{Kind: KindClient, Value: "ip-" + ip}
	}
	return Key{Kind: KindClient, Value: fingerprint}
}

// IPKey 来源 IP 的主体
func IPKey(ip string) Key {
	return Key{Kind: KindIP, Value: ip}
}

// Tokens 模型用量，按主体累计，不受窗口与清零影响
//
// 缓存命中与未命中是 DeepSeek 对输入的拆分，两者相加即输入；推理是输出里的思考部分
type Tokens struct {
	Prompt     int `json:"prompt"`
	Completion int `json:"completion"`
	Reasoning  int `json:"reasoning"`
	CacheHit   int `json:"cacheHit"`
	CacheMiss  int `json:"cacheMiss"`
}

// Add 累加一次调用的用量
func (t *Tokens) Add(other Tokens) {
	t.Prompt += other.Prompt
	t.Completion += other.Completion
	t.Reasoning += other.Reasoning
	t.CacheHit += other.CacheHit
	t.CacheMiss += other.CacheMiss
}

// Empty 一次调用没拿到任何用量
func (t Tokens) Empty() bool {
	return t == Tokens{}
}

// Usage 一个主体的用量与处置
type Usage struct {
	Key   string `json:"key"`
	Kind  string `json:"kind"`
	Value string `json:"value"`
	// Times 窗口内每次调用的时刻，窗口外的在写入时裁掉
	Times []time.Time `json:"times"`
	// Total 累计调用次数，不受窗口与清零影响
	Total   int       `json:"total"`
	FirstAt time.Time `json:"firstAt"`
	LastAt  time.Time `json:"lastAt"`
	// UserAgent 最近一次调用的 UA
	UserAgent string `json:"userAgent,omitempty"`
	// IP 最近一次调用的来源 IP，IP 主体就是它自己
	IP     string `json:"ip,omitempty"`
	Tokens Tokens `json:"tokens"`
	Rule   string `json:"rule,omitempty"`
	Note   string `json:"note,omitempty"`
}

// Recent 窗口内的调用次数
func (u Usage) Recent(window time.Duration) int {
	return len(u.within(time.Now(), window))
}

// within 截止到 now 的窗口内那部分调用时刻
func (u Usage) within(now time.Time, window time.Duration) []time.Time {
	from := now.Add(-window)
	for index, at := range u.Times {
		if at.After(from) {
			return u.Times[index:]
		}
	}
	return nil
}

// Entry 记一次调用要写的内容
type Entry struct {
	Key       Key
	UserAgent string
	IP        string
}

// limitOf 某类主体的额度，0 即不限
func (c Config) limitOf(kind string) int {
	if kind == KindIP {
		return c.IPLimit
	}
	return c.ClientLimit
}

// Store 配额存储，与报告共用同一个数据文件
//
// 额度随后台改动写进数据文件并换掉内存里这一份，不重启即刻生效
type Store struct {
	db     *bolt.DB
	mu     sync.RWMutex
	config Config
}

// New 在已打开的数据文件上建配额存储，额度取后台存过的那份，没有就用默认额度
func New(db *bolt.DB) (*Store, error) {
	store := &Store{db: db, config: DefaultConfig}
	err := db.Update(func(tx *bolt.Tx) error {
		for _, name := range [][]byte{bucketUsage, bucketSettings, bucketPasses} {
			if _, createErr := tx.CreateBucketIfNotExists(name); createErr != nil {
				return createErr
			}
		}

		raw := tx.Bucket(bucketSettings).Get(keyLimits)
		if raw == nil {
			return nil
		}
		return json.Unmarshal(raw, &store.config)
	})
	if err != nil {
		return nil, err
	}
	return store, nil
}

// Config 当前的额度与窗口
func (s *Store) Config() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

// SetConfig 换掉额度与窗口，立刻对后续请求生效
func (s *Store) SetConfig(config Config) error {
	if err := config.Validate(); err != nil {
		return err
	}

	raw, err := json.Marshal(config)
	if err != nil {
		return err
	}
	err = s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketSettings).Put(keyLimits, raw)
	})
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.config = config
	s.mu.Unlock()
	return nil
}

// Check 逐层校验配额，被拉黑返回 ErrBlocked，额度耗尽返回 LimitError，
// 只对白名单开放期间主体都不在白名单则返回 ErrNotWhitelisted
func (s *Store) Check(keys ...Key) error {
	now := time.Now()
	config := s.Config()
	return s.db.View(func(tx *bolt.Tx) error {
		var whitelisted bool
		for _, key := range keys {
			usage, err := readUsage(tx, key.String())
			if err != nil {
				return err
			}
			if usage.Rule == RuleAllow {
				whitelisted = true
			}
			if err = judge(usage, key.Kind, config, now); err != nil {
				return err
			}
		}

		if config.WhitelistOnly && !whitelisted {
			return ErrNotWhitelisted
		}
		return nil
	})
}

// CheckBlocked 只看主体有没有被后台拉黑，带通行码的解读也要过这一道
func (s *Store) CheckBlocked(keys ...Key) error {
	return s.db.View(func(tx *bolt.Tx) error {
		for _, key := range keys {
			usage, err := readUsage(tx, key.String())
			if err != nil {
				return err
			}
			if usage.Rule == RuleBlock {
				return ErrBlocked
			}
		}
		return nil
	})
}

// judge 一个主体当下是否放行
func judge(usage Usage, kind string, config Config, now time.Time) error {
	switch usage.Rule {
	case RuleBlock:
		return ErrBlocked
	case RuleAllow:
		return nil
	}

	limit := config.limitOf(kind)
	if limit <= 0 {
		return nil
	}

	times := usage.within(now, config.Window)
	if len(times) < limit {
		return nil
	}
	return LimitError{
		Kind:       kind,
		Limit:      limit,
		RetryAfter: times[0].Add(config.Window).Sub(now),
	}
}

// Record 记一次调用，白名单与拉黑的主体照记，后台据此看得到量
func (s *Store) Record(entries ...Entry) error {
	now := time.Now()
	window := s.Config().Window
	return s.db.Update(func(tx *bolt.Tx) error {
		for _, entry := range entries {
			key := entry.Key.String()
			usage, err := readUsage(tx, key)
			if err != nil {
				return err
			}

			if usage.Key == "" {
				usage.Key, usage.Kind, usage.Value = key, entry.Key.Kind, entry.Key.Value
				usage.FirstAt = now
			}
			usage.Times = append(usage.within(now, window), now)
			usage.Total++
			usage.LastAt = now
			usage.UserAgent = entry.UserAgent
			usage.IP = entry.IP

			if err = writeUsage(tx, usage); err != nil {
				return err
			}
		}
		return nil
	})
}

// AddTokens 把一次调用的模型用量累加到各主体上，流结束才知道用了多少，所以与 Record 分开
func (s *Store) AddTokens(keys []Key, tokens Tokens) error {
	if tokens.Empty() {
		return nil
	}

	return s.db.Update(func(tx *bolt.Tx) error {
		for _, key := range keys {
			usage, err := readUsage(tx, key.String())
			if err != nil {
				return err
			}
			// 没有记录说明这次调用没被 Record 下来，用量无处可挂，跳过
			if usage.Key == "" {
				continue
			}

			usage.Tokens.Add(tokens)
			if err = writeUsage(tx, usage); err != nil {
				return err
			}
		}
		return nil
	})
}

// Page 一页用量与总数
type Page struct {
	Total int
	Items []Usage
}

// List 按最近一次调用倒序分页列出全部主体
func (s *Store) List(offset, limit int) (Page, error) {
	var page Page
	err := s.db.View(func(tx *bolt.Tx) error {
		var all []Usage
		err := tx.Bucket(bucketUsage).ForEach(func(_, raw []byte) error {
			var usage Usage
			if unmarshalErr := json.Unmarshal(raw, &usage); unmarshalErr != nil {
				return unmarshalErr
			}
			all = append(all, usage)
			return nil
		})
		if err != nil {
			return err
		}

		slices.SortFunc(all, func(a, b Usage) int {
			if c := b.LastAt.Compare(a.LastAt); c != 0 {
				return c
			}
			return strings.Compare(a.Key, b.Key)
		})

		page.Total = len(all)
		if offset < len(all) {
			page.Items = all[offset:min(offset+limit, len(all))]
		}
		return nil
	})
	return page, err
}

// Get 取一个主体的用量，没有记录时返回零值
func (s *Store) Get(key string) (usage Usage, err error) {
	err = s.db.View(func(tx *bolt.Tx) error {
		usage, err = readUsage(tx, key)
		return err
	})
	return
}

// Reset 清掉窗口内的计数，累计次数与处置保留
func (s *Store) Reset(key string) error {
	return s.update(key, func(usage *Usage) {
		usage.Times = nil
	})
}

// SetRule 设置处置，rule 传 RuleNone 即恢复按额度限次
func (s *Store) SetRule(key, rule, note string) error {
	return s.update(key, func(usage *Usage) {
		usage.Rule = rule
		usage.Note = note
	})
}

// update 读出一个主体，就地改完写回；没有记录时按键新建
func (s *Store) update(key string, mutate func(usage *Usage)) error {
	kind, value, ok := strings.Cut(key, ":")
	if !ok || value == "" {
		return fmt.Errorf("配额主体 %q 格式不对", key)
	}

	return s.db.Update(func(tx *bolt.Tx) error {
		usage, err := readUsage(tx, key)
		if err != nil {
			return err
		}
		if usage.Key == "" {
			usage.Key, usage.Kind, usage.Value = key, kind, value
			usage.FirstAt = time.Now()
		}

		mutate(&usage)
		return writeUsage(tx, usage)
	})
}

// readUsage 在事务内读一个主体，没有记录时返回零值
func readUsage(tx *bolt.Tx, key string) (usage Usage, err error) {
	raw := tx.Bucket(bucketUsage).Get([]byte(key))
	if raw == nil {
		return
	}
	err = json.Unmarshal(raw, &usage)
	return
}

// writeUsage 在事务内写一个主体
func writeUsage(tx *bolt.Tx, usage Usage) error {
	raw, err := json.Marshal(usage)
	if err != nil {
		return err
	}
	return tx.Bucket(bucketUsage).Put([]byte(usage.Key), raw)
}

// roundUpHour 把剩余时长说成人能读的粗粒度，不足一小时按分钟
func roundUpHour(d time.Duration) string {
	if d < time.Hour {
		minutes := max(int((d + time.Minute - 1).Minutes()), 1)
		return fmt.Sprintf("%d 分钟", minutes)
	}
	return fmt.Sprintf("%d 小时", int((d + time.Hour - 1).Hours()))
}
