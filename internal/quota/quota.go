// Package quota 免费解读次数的配额
//
// 解读要花上游的钱，按客户端限次。配额分两层：浏览器指纹是主闸，额度小，正常用户只会
// 撞这一道；来源 IP 是兜底阀，额度大，挡的是同一出口下反复换无痕窗口的量，共享出口的
// 正常用户撞不到。两道都过才放行。窗口是滚动的，每次调用的时刻都记下来，窗口外的在写入
// 时裁掉。后台可以把某个主体设成白名单（不限次）或拉黑（一律拒），也可以清掉它的计数
package quota

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
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

// bucketUsage 按主体键存用量与处置
var bucketUsage = []byte("quota")

// ErrBlocked 主体被后台拉黑
var ErrBlocked = errors.New("已被限制使用")

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
	IP   string `json:"ip,omitempty"`
	Rule string `json:"rule,omitempty"`
	Note string `json:"note,omitempty"`
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

// Config 额度与窗口
type Config struct {
	// ClientLimit 单个浏览器指纹在窗口内的次数，0 即不限
	ClientLimit int
	// IPLimit 单个 IP 在窗口内的次数，0 即不限
	IPLimit int
	Window  time.Duration
}

// limitOf 某类主体的额度，0 即不限
func (c Config) limitOf(kind string) int {
	if kind == KindIP {
		return c.IPLimit
	}
	return c.ClientLimit
}

// Store 配额存储，与报告共用同一个数据文件
type Store struct {
	db     *bolt.DB
	config Config
}

// New 在已打开的数据文件上建配额存储
func New(db *bolt.DB, config Config) (*Store, error) {
	err := db.Update(func(tx *bolt.Tx) error {
		_, createErr := tx.CreateBucketIfNotExists(bucketUsage)
		return createErr
	})
	if err != nil {
		return nil, err
	}
	return &Store{db: db, config: config}, nil
}

// Config 当前的额度与窗口
func (s *Store) Config() Config {
	return s.config
}

// Check 逐层校验配额，被拉黑返回 ErrBlocked，额度耗尽返回 LimitError
func (s *Store) Check(keys ...Key) error {
	now := time.Now()
	return s.db.View(func(tx *bolt.Tx) error {
		for _, key := range keys {
			usage, err := readUsage(tx, key.String())
			if err != nil {
				return err
			}
			if err = s.judge(usage, key.Kind, now); err != nil {
				return err
			}
		}
		return nil
	})
}

// judge 一个主体当下是否放行
func (s *Store) judge(usage Usage, kind string, now time.Time) error {
	switch usage.Rule {
	case RuleBlock:
		return ErrBlocked
	case RuleAllow:
		return nil
	}

	limit := s.config.limitOf(kind)
	if limit <= 0 {
		return nil
	}

	times := usage.within(now, s.config.Window)
	if len(times) < limit {
		return nil
	}
	return LimitError{
		Kind:       kind,
		Limit:      limit,
		RetryAfter: times[0].Add(s.config.Window).Sub(now),
	}
}

// Record 记一次调用，白名单与拉黑的主体照记，后台据此看得到量
func (s *Store) Record(entries ...Entry) error {
	now := time.Now()
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
			usage.Times = append(usage.within(now, s.config.Window), now)
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
