// Package report 解读报告的持久化与分享
//
// 每一次命理解读的排盘输入、选项与解读正文都存进本地的 bbolt 文件。报告由客户端
// 生成的 128 位随机 id 标识，持有 id 即可管理这份报告的分享；开启分享后得到一个
// 短哈希，持有哈希的人经 /s/{hash} 查看，分享可以设密码。
// 报告带体系字段，八字与紫微的选项结构不同，存储层不解析选项
package report

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/liasica/kismet/internal/birth"
)

// 命理体系
const (
	SystemBazi  = "bazi"
	SystemZiwei = "ziwei"
)

// 存储桶：reports 按报告 id 存整条记录，shares 按分享哈希存报告 id
var (
	bucketReports = []byte("reports")
	bucketShares  = []byte("shares")
)

// ErrNotFound 报告或分享不存在
var ErrNotFound = errors.New("报告不存在")

// shareHashBytes 分享哈希的随机字节数，base64url 编码后 11 个字符
const shareHashBytes = 8

// Share 分享设置
type Share struct {
	Hash      string    `json:"hash"`
	CreatedAt time.Time `json:"createdAt"`
	// Salt 与 Key 是密码经 PBKDF2 派生的结果，未设密码时为空
	Salt []byte `json:"salt,omitempty"`
	Key  []byte `json:"key,omitempty"`
}

// Locked 是否设了密码
func (s Share) Locked() bool {
	return len(s.Key) > 0
}

// Report 一份报告：排盘输入、选项与解读正文
type Report struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	// System 命理体系，bazi 或 ziwei；早期记录没有这个字段，读出时按 bazi 补上
	System string      `json:"system"`
	Input  birth.Input `json:"input"`
	// Options 该体系的排盘选项，原样保存，由接口层按体系解析
	Options json.RawMessage `json:"options"`
	// Model 生成解读的模型名，尚未解读时为空
	Model string `json:"model,omitempty"`
	// Analysis 解读正文 Markdown，尚未解读时为空
	Analysis string `json:"analysis"`
	Share    *Share `json:"share,omitempty"`
}

// Store bbolt 存储，单文件，进程内并发安全
type Store struct {
	db *bolt.DB
}

// Open 打开数据文件，不存在则创建
func Open(path string) (*Store, error) {
	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: time.Second})
	if err != nil {
		return nil, err
	}

	err = db.Update(func(tx *bolt.Tx) error {
		for _, name := range [][]byte{bucketReports, bucketShares} {
			if _, createErr := tx.CreateBucketIfNotExists(name); createErr != nil {
				return createErr
			}
		}
		return nil
	})
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close 关闭数据文件
func (s *Store) Close() error {
	return s.db.Close()
}

// Get 按 id 取报告
func (s *Store) Get(id string) (found Report, err error) {
	err = s.db.View(func(tx *bolt.Tx) error {
		return readReport(tx, id, &found)
	})
	return
}

// Upsert 新建报告，或更新已有报告的体系、输入与选项；解读正文与分享设置保留
func (s *Store) Upsert(id, system string, input birth.Input, options json.RawMessage) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		var item Report
		err := readReport(tx, id, &item)
		if errors.Is(err, ErrNotFound) {
			item = Report{ID: id, CreatedAt: time.Now()}
		} else if err != nil {
			return err
		}

		item.System = system
		item.Input = input
		item.Options = options
		return writeReport(tx, &item)
	})
}

// SaveAnalysis 写入解读正文与生成它的模型名，model 为空时保留原有的模型名
func (s *Store) SaveAnalysis(id, model, analysis string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		var item Report
		err := readReport(tx, id, &item)
		if err != nil {
			return err
		}

		if model != "" {
			item.Model = model
		}
		item.Analysis = analysis
		return writeReport(tx, &item)
	})
}

// Share 开启分享；已开启时哈希不变，只更新密码。password 为空即不设密码
func (s *Store) Share(id, password string) (share Share, err error) {
	err = s.db.Update(func(tx *bolt.Tx) error {
		var item Report
		readErr := readReport(tx, id, &item)
		if readErr != nil {
			return readErr
		}

		if item.Share == nil {
			hash := newShareHash(tx)
			if putErr := tx.Bucket(bucketShares).Put([]byte(hash), []byte(id)); putErr != nil {
				return putErr
			}
			item.Share = &Share{Hash: hash, CreatedAt: time.Now()}
		}

		if password == "" {
			item.Share.Salt, item.Share.Key = nil, nil
		} else {
			var deriveErr error
			item.Share.Salt, item.Share.Key, deriveErr = derivePassword(password)
			if deriveErr != nil {
				return deriveErr
			}
		}

		share = *item.Share
		return writeReport(tx, &item)
	})
	return
}

// Unshare 取消分享，哈希随即失效；未分享时什么都不做
func (s *Store) Unshare(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		var item Report
		err := readReport(tx, id, &item)
		if err != nil {
			return err
		}
		if item.Share == nil {
			return nil
		}

		if err = tx.Bucket(bucketShares).Delete([]byte(item.Share.Hash)); err != nil {
			return err
		}
		item.Share = nil
		return writeReport(tx, &item)
	})
}

// Shared 按分享哈希取报告
func (s *Store) Shared(hash string) (found Report, err error) {
	err = s.db.View(func(tx *bolt.Tx) error {
		id := tx.Bucket(bucketShares).Get([]byte(hash))
		if id == nil {
			return ErrNotFound
		}
		return readReport(tx, string(id), &found)
	})
	return
}

// reportStamp 排序用的报告摘要：只有 id 与创建时间
type reportStamp struct {
	id        string
	createdAt time.Time
}

// Page 一页报告与总数
type Page struct {
	Total   int
	Reports []Report
}

// List 按创建时间倒序分页列出全部报告，offset 越过末尾时报告为空、总数照常返回
func (s *Store) List(offset, limit int) (Page, error) {
	var page Page
	err := s.db.View(func(tx *bolt.Tx) error {
		// 先只解出 id 与创建时间做排序，完整记录只解命中的一页
		var stamps []reportStamp
		err := tx.Bucket(bucketReports).ForEach(func(id, raw []byte) error {
			var head struct {
				CreatedAt time.Time `json:"createdAt"`
			}
			err := json.Unmarshal(raw, &head)
			if err == nil {
				stamps = append(stamps, reportStamp{id: string(id), createdAt: head.CreatedAt})
			}
			return err
		})
		if err != nil {
			return err
		}

		slices.SortFunc(stamps, func(a, b reportStamp) int {
			if c := b.createdAt.Compare(a.createdAt); c != 0 {
				return c
			}
			return strings.Compare(a.id, b.id)
		})

		page.Total = len(stamps)
		if offset >= len(stamps) {
			return nil
		}
		for _, stamp := range stamps[offset:min(offset+limit, len(stamps))] {
			var item Report
			if err = readReport(tx, stamp.id, &item); err != nil {
				return err
			}
			page.Reports = append(page.Reports, item)
		}
		return nil
	})
	return page, err
}

// readReport 在事务内读一条报告，早期记录没有体系字段，按八字补上
func readReport(tx *bolt.Tx, id string, item *Report) error {
	raw := tx.Bucket(bucketReports).Get([]byte(id))
	if raw == nil {
		return ErrNotFound
	}
	if err := json.Unmarshal(raw, item); err != nil {
		return err
	}
	if item.System == "" {
		item.System = SystemBazi
	}
	return nil
}

// writeReport 在事务内写一条报告，顺带刷新更新时间
func writeReport(tx *bolt.Tx, item *Report) error {
	item.UpdatedAt = time.Now()
	raw, err := json.Marshal(item)
	if err != nil {
		return err
	}
	return tx.Bucket(bucketReports).Put([]byte(item.ID), raw)
}

// newShareHash 生成一个未被占用的分享哈希
func newShareHash(tx *bolt.Tx) string {
	shares := tx.Bucket(bucketShares)
	raw := make([]byte, shareHashBytes)
	for {
		_, _ = rand.Read(raw)
		hash := base64.RawURLEncoding.EncodeToString(raw)
		if shares.Get([]byte(hash)) == nil {
			return hash
		}
	}
}
