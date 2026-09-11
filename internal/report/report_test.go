package report

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/liasica/kismet/internal/birth"
)

func openTemp(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("打开失败：%v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

const reportID = "0123456789abcdef0123456789abcdef"

func TestUpsertKeepsSystemAndRawOptions(t *testing.T) {
	store := openTemp(t)
	input := birth.Input{Year: 1990, Month: 5, Day: 3, Hour: 12, Minute: 30, Gender: birth.GenderMale}
	options := json.RawMessage(`{"useTrueSolarTime":false,"useDaylightSaving":false,"lateZiAsNextDay":false,"maxAge":100}`)

	if err := store.Upsert(reportID, SystemZiwei, input, options); err != nil {
		t.Fatalf("写入失败：%v", err)
	}
	item, err := store.Get(reportID)
	if err != nil {
		t.Fatalf("读取失败：%v", err)
	}
	if item.System != SystemZiwei || string(item.Options) != string(options) || item.Input.Year != 1990 {
		t.Errorf("读回的报告不符：%+v", item)
	}

	// 再写一次只换选项，正文与分享保留
	if err = store.SaveAnalysis(reportID, "model-x", "正文"); err != nil {
		t.Fatalf("写正文失败：%v", err)
	}
	if err = store.Upsert(reportID, SystemZiwei, input, json.RawMessage(`{"maxAge":80}`)); err != nil {
		t.Fatalf("二次写入失败：%v", err)
	}
	if item, err = store.Get(reportID); err != nil {
		t.Fatalf("读取失败：%v", err)
	}
	if item.Analysis != "正文" || item.Model != "model-x" || string(item.Options) != `{"maxAge":80}` {
		t.Errorf("二次写入后不符：%+v", item)
	}
}

// 早期数据没有 system 字段，选项是八字结构，读出时按八字处理
func TestLegacyRecordDefaultsToBazi(t *testing.T) {
	store := openTemp(t)
	legacy := `{"id":"` + reportID + `","createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z",` +
		`"input":{"year":1990,"month":5,"day":3,"hour":12,"minute":30,"gender":"male"},` +
		`"options":{"useTrueSolarTime":true,"qiYunPrecision":"hour","maxAge":100},"analysis":""}`
	err := store.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketReports).Put([]byte(reportID), []byte(legacy))
	})
	if err != nil {
		t.Fatalf("写旧记录失败：%v", err)
	}

	item, err := store.Get(reportID)
	if err != nil {
		t.Fatalf("读取失败：%v", err)
	}
	if item.System != SystemBazi {
		t.Errorf("旧记录应按八字处理，得到 %q", item.System)
	}
	var options struct {
		QiYunPrecision string `json:"qiYunPrecision"`
	}
	if err = json.Unmarshal(item.Options, &options); err != nil || options.QiYunPrecision != "hour" {
		t.Errorf("旧记录的选项应原样保留：%s", item.Options)
	}

	page, err := store.List(0, 10)
	if err != nil || page.Total != 1 || page.Reports[0].System != SystemBazi {
		t.Errorf("列表里的旧记录也应补上体系：%+v %v", page, err)
	}
	if item.CreatedAt.Before(time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("创建时间被改动：%v", item.CreatedAt)
	}
}
