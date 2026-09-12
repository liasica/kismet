package httpapi

import (
	"math"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/liasica/kismet/internal/quota"
	"github.com/liasica/kismet/internal/report"
)

// 后台的用量页：看各客户端与各 IP 的解读次数，清零、拉黑或加白名单
const (
	// usageNoteMaxRunes 备注的长度上限
	usageNoteMaxRunes = 200
	// usagePageDefault 用量列表每页默认条数
	usagePageDefault = 50
	// usageReportsMax 每个主体最多附带几份报告，够认出是谁就行
	usageReportsMax = 10
)

// quotaKeyPattern 配额主体的键，形如 `client:xxxx` 或 `ip:1.2.3.4`
var quotaKeyPattern = regexp.MustCompile(`^(client|ip):[0-9A-Za-z_\-.:]{1,64}$`)

// adminUsage 列表里的一条用量，不带每次调用的时刻
type adminUsage struct {
	Key   string `json:"key"`
	Kind  string `json:"kind"`
	Value string `json:"value"`
	// Recent 当前窗口内的次数
	Recent  int       `json:"recent"`
	Total   int       `json:"total"`
	FirstAt time.Time `json:"firstAt"`
	LastAt  time.Time `json:"lastAt"`
	// UserAgent 最近一次调用的 UA
	UserAgent string `json:"userAgent,omitempty"`
	// IP 最近一次调用的来源 IP
	IP string `json:"ip,omitempty"`
	// Tokens 累计的模型用量
	Tokens quota.Tokens `json:"tokens"`
	Rule   string       `json:"rule,omitempty"`
	Note   string       `json:"note,omitempty"`
	// Reports 这个主体名下最近的几份报告，用来认出它是谁
	Reports []usageReport `json:"reports,omitempty"`
	// ReportTotal 这个主体名下的报告总数
	ReportTotal int `json:"reportTotal"`
}

// usageReport 主体名下的一份报告
type usageReport struct {
	ID        string    `json:"id"`
	System    string    `json:"system"`
	Name      string    `json:"name,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	// AnalysisRunes 解读正文的字符数，0 即尚未解读
	AnalysisRunes int `json:"analysisRunes"`
}

// usageReports 一个主体名下的报告：最近的几份与总数
type usageReports struct {
	items []usageReport
	total int
}

// adminUsageList 用量列表：总数、当前页与生效中的额度
type adminUsageList struct {
	Total int          `json:"total"`
	Items []adminUsage `json:"items"`
	// Limits 生效中的额度，0 即该层不限次
	Limits quotaLimits `json:"limits"`
}

// quotaLimits 生效中的额度与窗口，也是后台改额度的请求体
type quotaLimits struct {
	Client int `json:"client"`
	IP     int `json:"ip"`
	// WindowHours 滚动窗口的小时数
	WindowHours float64 `json:"windowHours"`
	// WhitelistOnly 开着时只有白名单主体能解读，额度对其余人不再起作用
	WhitelistOnly bool `json:"whitelistOnly"`
}

func limitsOf(config quota.Config) quotaLimits {
	return quotaLimits{
		Client:        config.ClientLimit,
		IP:            config.IPLimit,
		WindowHours:   config.Window.Hours(),
		WhitelistOnly: config.WhitelistOnly,
	}
}

// usageKeyRequest 指定一个配额主体
type usageKeyRequest struct {
	Key string `json:"key"`
}

// usageRuleRequest 设置一个配额主体的处置
type usageRuleRequest struct {
	Key  string `json:"key"`
	Rule string `json:"rule"`
	Note string `json:"note"`
}

func usageOf(item quota.Usage, window time.Duration) adminUsage {
	return adminUsage{
		Key:       item.Key,
		Kind:      item.Kind,
		Value:     item.Value,
		Recent:    item.Recent(window),
		Total:     item.Total,
		FirstAt:   item.FirstAt,
		LastAt:    item.LastAt,
		UserAgent: item.UserAgent,
		IP:        item.IP,
		Tokens:    item.Tokens,
		Rule:      item.Rule,
		Note:      item.Note,
	}
}

// handleAdminUsage 分页列出各配额主体的用量，最近调用的在前
func (s *Server) handleAdminUsage(w http.ResponseWriter, r *http.Request) {
	offset, limit, err := parseUsagePageQuery(r)
	if err != nil {
		writeError(w, err)
		return
	}

	var page quota.Page
	page, err = s.quota.List(offset, limit)
	if err != nil {
		writeError(w, err)
		return
	}

	var grouped map[string]*usageReports
	if grouped, err = s.reportsByQuotaKey(); err != nil {
		writeError(w, err)
		return
	}

	config := s.quota.Config()
	list := adminUsageList{
		Total:  page.Total,
		Items:  make([]adminUsage, 0, len(page.Items)),
		Limits: limitsOf(config),
	}
	for _, item := range page.Items {
		row := usageOf(item, config.Window)
		if bucket := grouped[item.Key]; bucket != nil {
			row.Reports = bucket.items
			row.ReportTotal = bucket.total
		}
		list.Items = append(list.Items, row)
	}
	writeJSON(w, http.StatusOK, list)
}

// handleAdminQuota 改额度与窗口，写进数据文件并立刻对后续请求生效
func (s *Server) handleAdminQuota(w http.ResponseWriter, r *http.Request) {
	var req quotaLimits
	if err := decodeJSON(r, maxRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}

	config := quota.Config{
		ClientLimit:   req.Client,
		IPLimit:       req.IP,
		Window:        time.Duration(req.WindowHours * float64(time.Hour)),
		WhitelistOnly: req.WhitelistOnly,
	}
	if err := config.Validate(); err != nil {
		writeError(w, badRequest("%s", err.Error()))
		return
	}
	if err := s.quota.SetConfig(config); err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, limitsOf(s.quota.Config()))
}

// handleAdminUsageReset 清掉一个主体在窗口内的计数，累计次数与处置保留
func (s *Server) handleAdminUsageReset(w http.ResponseWriter, r *http.Request) {
	var req usageKeyRequest
	if err := decodeJSON(r, maxRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}

	key, err := requireQuotaKey(req.Key)
	if err != nil {
		writeError(w, err)
		return
	}
	if err = s.quota.Reset(key); err != nil {
		writeError(w, err)
		return
	}

	s.writeUsage(w, key)
}

// handleAdminUsageRule 设置一个主体的处置，rule 传空即恢复按额度限次
func (s *Server) handleAdminUsageRule(w http.ResponseWriter, r *http.Request) {
	var req usageRuleRequest
	if err := decodeJSON(r, maxRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}

	key, err := requireQuotaKey(req.Key)
	if err != nil {
		writeError(w, err)
		return
	}
	rule, err := requireQuotaRule(req.Rule)
	if err != nil {
		writeError(w, err)
		return
	}
	note := strings.TrimSpace(req.Note)
	if utf8.RuneCountInString(note) > usageNoteMaxRunes {
		writeError(w, badRequest("备注最长 %d 个字符", usageNoteMaxRunes))
		return
	}

	if err = s.quota.SetRule(key, rule, note); err != nil {
		writeError(w, err)
		return
	}

	s.writeUsage(w, key)
}

// writeUsage 回写一个主体改动后的样子，前端据此就地更新那一行
func (s *Server) writeUsage(w http.ResponseWriter, key string) {
	item, err := s.quota.Get(key)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, usageOf(item, s.quota.Config().Window))
}

// reportsByQuotaKey 把全部报告归到各配额主体名下，键与配额存的主体键一致
//
// 一份报告同时挂在它的指纹与 IP 两个主体下，各主体按创建时间倒序只留最近几份
func (s *Server) reportsByQuotaKey() (map[string]*usageReports, error) {
	grouped := make(map[string]*usageReports)
	err := s.reports.Each(func(item report.Report) error {
		if item.Client == nil {
			return nil
		}

		summary := usageReport{
			ID:            item.ID,
			System:        item.System,
			Name:          item.Input.Name,
			CreatedAt:     item.CreatedAt,
			AnalysisRunes: utf8.RuneCountInString(item.Analysis),
		}
		for _, key := range quotaKeysOf(*item.Client) {
			bucket := grouped[key.String()]
			if bucket == nil {
				bucket = &usageReports{}
				grouped[key.String()] = bucket
			}
			bucket.total++
			bucket.items = append(bucket.items, summary)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	for _, bucket := range grouped {
		slices.SortFunc(bucket.items, func(a, b usageReport) int {
			return b.CreatedAt.Compare(a.CreatedAt)
		})
		if len(bucket.items) > usageReportsMax {
			bucket.items = bucket.items[:usageReportsMax]
		}
	}
	return grouped, nil
}

// parseUsagePageQuery 解析用量列表的分页参数
func parseUsagePageQuery(r *http.Request) (offset, limit int, err error) {
	query := r.URL.Query()
	if offset, err = queryInt(query.Get("offset"), "offset", 0, 0, math.MaxInt32); err != nil {
		return
	}
	limit, err = queryInt(query.Get("limit"), "limit", usagePageDefault, 1, adminPageMax)
	return
}

// requireQuotaKey 校验配额主体的键
func requireQuotaKey(key string) (string, error) {
	key = strings.TrimSpace(key)
	if !quotaKeyPattern.MatchString(key) {
		return "", badRequest("key 应形如 client:xxxx 或 ip:1.2.3.4")
	}
	return key, nil
}

// requireQuotaRule 校验处置
func requireQuotaRule(rule string) (string, error) {
	switch strings.TrimSpace(rule) {
	case quota.RuleNone, "none":
		return quota.RuleNone, nil
	case quota.RuleAllow:
		return quota.RuleAllow, nil
	case quota.RuleBlock:
		return quota.RuleBlock, nil
	}
	return "", badRequest(`rule 应为 "allow"、"block" 或空`)
}
