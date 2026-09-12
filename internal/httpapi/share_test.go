package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/report"
	"github.com/liasica/kismet/internal/ziwei"
)

// newShareTestServer 只测分享接口用，区划、知识库、配额与后台密码都用不上
func newShareTestServer(t *testing.T) *Server {
	t.Helper()
	store, err := report.Open(filepath.Join(t.TempDir(), "share_test.db"))
	if err != nil {
		t.Fatalf("打开报告存储失败：%v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return NewServer(nil, DeepSeekConfig{}, store, nil, nil, "", nil)
}

// TestCreateShareKeepsExistingSystemWhenOmitted 已存的紫微报告再收到一次不带 system 的分享请求，
// 体系与选项不该被悄悄换成八字：system 缺省时要看库里这份报告已存的体系，不能不看就按八字处理
func TestCreateShareKeepsExistingSystemWhenOmitted(t *testing.T) {
	s := newShareTestServer(t)
	id := "0123456789abcdef0123456789abcdef"

	// post 直接调分享接口的 handler，不必经过完整的路由
	post := func(body []byte) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/api/reports/"+id+"/share", bytes.NewReader(body))
		req.SetPathValue("id", id)
		w := httptest.NewRecorder()
		s.handleCreateShare(w, req)
		return w
	}

	input := birth.Input{Year: 1990, Month: 5, Day: 3, Hour: 12, Minute: 30, Gender: birth.GenderMale}
	optionsRaw, err := json.Marshal(ziwei.DefaultOptions)
	if err != nil {
		t.Fatalf("序列化紫微选项失败：%v", err)
	}

	// 第一次带 system 建档
	firstBody, err := json.Marshal(shareRequest{
		System:  report.SystemZiwei,
		Input:   &input,
		Options: optionsRaw,
	})
	if err != nil {
		t.Fatalf("序列化请求失败：%v", err)
	}
	if w := post(firstBody); w.Code != http.StatusOK {
		t.Fatalf("建档并分享应成功，状态码 %d：%s", w.Code, w.Body.String())
	}

	// 第二次不带 system，模拟前端漏传的场景
	secondBody, err := json.Marshal(shareRequest{
		Input:   &input,
		Options: optionsRaw,
	})
	if err != nil {
		t.Fatalf("序列化请求失败：%v", err)
	}
	if w := post(secondBody); w.Code != http.StatusOK {
		t.Fatalf("不带 system 的分享请求应成功，状态码 %d：%s", w.Code, w.Body.String())
	}

	item, err := s.reports.Get(id)
	if err != nil {
		t.Fatalf("取报告失败：%v", err)
	}
	if item.System != report.SystemZiwei {
		t.Errorf("体系应仍是 ziwei，得到 %s", item.System)
	}

	var gotOptions ziwei.Options
	if err = json.Unmarshal(item.Options, &gotOptions); err != nil {
		t.Fatalf("解析选项失败：%v", err)
	}
	if gotOptions != ziwei.DefaultOptions {
		t.Errorf("选项应仍是紫微的默认选项，得到 %+v", gotOptions)
	}
}
