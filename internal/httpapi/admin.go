package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/report"
)

// 后台管理：持有管理密码的人查看服务端保存的全部报告
//
// 密码取环境变量 ADMIN_PASSWORD，请求以 Authorization: Bearer 携带，
// 未配置密码时后台接口一律 503；密码连续输错与分享解锁一样进入冷却
const (
	// adminPageDefault 列表每页默认条数
	adminPageDefault = 50
	// adminPageMax 列表每页条数上限
	adminPageMax = 200
	// adminLimiterKey 管理密码的错误计数只有一个桶，不按客户端区分
	adminLimiterKey = "admin"
)

// adminReportSummary 列表里的一条报告，不带解读正文
type adminReportSummary struct {
	ID        string      `json:"id"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
	System    string      `json:"system"`
	Input     birth.Input `json:"input"`
	// Model 生成解读的模型名，尚未解读时为空
	Model string `json:"model,omitempty"`
	// AnalysisRunes 解读正文的字符数，0 即尚未解读
	AnalysisRunes int        `json:"analysisRunes"`
	Share         *shareInfo `json:"share,omitempty"`
	// Client 最近一次写入这份报告的客户端，早期记录没有
	Client *report.Client `json:"client,omitempty"`
}

// adminReport 单份报告的全部内容，选项按体系原样透传
type adminReport struct {
	adminReportSummary
	Options  json.RawMessage `json:"options"`
	Analysis string          `json:"analysis"`
}

// adminReportList 列表响应：总数与当前页
type adminReportList struct {
	Total   int                  `json:"total"`
	Reports []adminReportSummary `json:"reports"`
}

func summaryOf(item report.Report) adminReportSummary {
	summary := adminReportSummary{
		ID:            item.ID,
		CreatedAt:     item.CreatedAt,
		UpdatedAt:     item.UpdatedAt,
		System:        item.System,
		Input:         item.Input,
		Model:         item.Model,
		AnalysisRunes: utf8.RuneCountInString(item.Analysis),
		Client:        item.Client,
	}
	if item.Share != nil {
		info := infoOf(*item.Share)
		summary.Share = &info
	}
	return summary
}

// requireAdmin 校验管理密码：未配置时 503，缺失或不匹配时 401，连续输错进入冷却
func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.adminPassword == "" {
			writeError(w, apiError{
				status:  http.StatusServiceUnavailable,
				message: "服务端未配置 ADMIN_PASSWORD，后台不可用",
			})
			return
		}

		password, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || password == "" {
			writeError(w, apiError{status: http.StatusUnauthorized, message: "需要管理密码"})
			return
		}
		if !s.adminLimiter.allow(adminLimiterKey) {
			writeError(w, apiError{
				status:  http.StatusTooManyRequests,
				message: "密码错误次数过多，请稍后再试",
			})
			return
		}
		if subtle.ConstantTimeCompare([]byte(password), []byte(s.adminPassword)) != 1 {
			s.adminLimiter.fail(adminLimiterKey)
			writeError(w, apiError{status: http.StatusUnauthorized, message: "管理密码不正确"})
			return
		}

		s.adminLimiter.reset(adminLimiterKey)
		next(w, r)
	}
}

// handleAdminReports 分页列出全部报告，最新创建的在前
func (s *Server) handleAdminReports(w http.ResponseWriter, r *http.Request) {
	offset, limit, err := parsePageQuery(r)
	if err != nil {
		writeError(w, err)
		return
	}

	var page report.Page
	page, err = s.reports.List(offset, limit)
	if err != nil {
		writeError(w, err)
		return
	}

	list := adminReportList{
		Total:   page.Total,
		Reports: make([]adminReportSummary, 0, len(page.Reports)),
	}
	for _, item := range page.Reports {
		list.Reports = append(list.Reports, summaryOf(item))
	}
	writeJSON(w, http.StatusOK, list)
}

// handleAdminReport 取单份报告的全部内容
func (s *Server) handleAdminReport(w http.ResponseWriter, r *http.Request) {
	id, err := requireReportID(r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}

	var item report.Report
	item, err = s.reports.Get(id)
	if err != nil {
		writeError(w, reportError(err))
		return
	}

	writeJSON(w, http.StatusOK, adminReport{
		adminReportSummary: summaryOf(item),
		Options:            item.Options,
		Analysis:           item.Analysis,
	})
}

// parsePageQuery 解析分页参数 offset 与 limit，缺省分别为 0 与默认页长
func parsePageQuery(r *http.Request) (offset, limit int, err error) {
	query := r.URL.Query()
	if offset, err = queryInt(query.Get("offset"), "offset", 0, 0, math.MaxInt32); err != nil {
		return
	}
	limit, err = queryInt(query.Get("limit"), "limit", adminPageDefault, 1, adminPageMax)
	return
}

// queryInt 解析一个可选的整数查询参数，缺省取 fallback，不是整数或越界报 400
func queryInt(
	raw string,
	field string,
	fallback int,
	low int,
	high int,
) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < low || value > high {
		return 0, badRequest("%s 应为 %d 到 %d 之间的整数", field, low, high)
	}
	return value, nil
}
