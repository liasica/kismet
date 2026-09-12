package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/quota"
)

// 通行码：后台生成发给用户，解读请求带上 X-Access-Code 即跳过免费次数的两层额度
//
// 用户那侧只查得到一把码的类型与剩余次数，备注、用过它的客户端与模型用量只在后台可见

// 响应里的机器可读标识
const (
	// codePassInvalid 码不能用，前端据此清掉本地存的码
	codePassInvalid = "pass_invalid"
	// codeQuotaExhausted 免费次数不够了，前端据此提示填通行码
	codeQuotaExhausted = "quota_exhausted"
)

// passInfo 一把码对外的样子，后台列表与用户查码共用
type passInfo struct {
	Code string `json:"code"`
	Kind string `json:"kind"`
	// Times 次数池的总数，不限次的码为 0
	Times int `json:"times"`
	Used  int `json:"used"`
	// Left 剩余次数，不限次的码为 -1
	Left int `json:"left"`
	// Valid 当下能不能用
	Valid bool `json:"valid"`
	// Reason 不能用的缘由，能用时为空
	Reason string `json:"reason,omitempty"`
}

// adminPass 后台列表里的一把码，比用户查码多出备注、用量与用过它的客户端
type adminPass struct {
	passInfo
	Note          string       `json:"note,omitempty"`
	Disabled      bool         `json:"disabled"`
	CreatedAt     time.Time    `json:"createdAt"`
	LastAt        time.Time    `json:"lastAt"`
	LastIP        string       `json:"lastIp,omitempty"`
	LastUserAgent string       `json:"lastUserAgent,omitempty"`
	Clients       []string     `json:"clients,omitempty"`
	Tokens        quota.Tokens `json:"tokens"`
}

// adminPassList 通行码列表：总数与当前页
type adminPassList struct {
	Total  int         `json:"total"`
	Passes []adminPass `json:"passes"`
}

// passCreateRequest 后台生成通行码
type passCreateRequest struct {
	Kind string `json:"kind"`
	// Times 次数码的次数池大小
	Times int `json:"times"`
	// Count 这次生成几把
	Count int    `json:"count"`
	Note  string `json:"note"`
}

// passDisableRequest 作废或恢复一把码
type passDisableRequest struct {
	Code     string `json:"code"`
	Disabled bool   `json:"disabled"`
}

func infoOfPass(pass quota.Pass) passInfo {
	info := passInfo{
		Code:  pass.Code,
		Kind:  pass.Kind,
		Times: pass.Times,
		Used:  pass.Used,
		Left:  pass.Left(),
		Valid: true,
	}
	if err := pass.Usable(); err != nil {
		info.Valid, info.Reason = false, err.Error()
	}
	return info
}

func adminPassOf(pass quota.Pass) adminPass {
	return adminPass{
		passInfo:      infoOfPass(pass),
		Note:          pass.Note,
		Disabled:      pass.Disabled,
		CreatedAt:     pass.CreatedAt,
		LastAt:        pass.LastAt,
		LastIP:        pass.LastIP,
		LastUserAgent: pass.LastUserAgent,
		Clients:       pass.Clients,
		Tokens:        pass.Tokens,
	}
}

// handlePass 查一把码的类型与剩余次数，用户输码后据此知道它还能不能用
func (s *Server) handlePass(w http.ResponseWriter, r *http.Request) {
	code, err := requirePassCode(r.PathValue("code"))
	if err != nil {
		writeError(w, err)
		return
	}

	pass, err := s.quota.Pass(code)
	if err != nil {
		writeError(w, passError(err))
		return
	}

	writeJSON(w, http.StatusOK, infoOfPass(pass))
}

// handleAdminPasses 分页列出全部通行码，最近生成的在前
func (s *Server) handleAdminPasses(w http.ResponseWriter, r *http.Request) {
	offset, limit, err := parsePageQuery(r)
	if err != nil {
		writeError(w, err)
		return
	}

	page, err := s.quota.ListPasses(offset, limit)
	if err != nil {
		writeError(w, err)
		return
	}

	list := adminPassList{Total: page.Total, Passes: make([]adminPass, 0, len(page.Items))}
	for _, pass := range page.Items {
		list.Passes = append(list.Passes, adminPassOf(pass))
	}
	writeJSON(w, http.StatusOK, list)
}

// handleAdminPassCreate 生成一批通行码并返回，管理员抄走发给用户
func (s *Server) handleAdminPassCreate(w http.ResponseWriter, r *http.Request) {
	var req passCreateRequest
	if err := decodeJSON(r, maxRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}

	passes, err := s.quota.NewPasses(quota.PassDraft{
		Kind:  strings.TrimSpace(req.Kind),
		Times: req.Times,
		Count: req.Count,
		Note:  req.Note,
	})
	if err != nil {
		writeError(w, badRequest("%s", err.Error()))
		return
	}

	list := adminPassList{Total: len(passes), Passes: make([]adminPass, 0, len(passes))}
	for _, pass := range passes {
		list.Passes = append(list.Passes, adminPassOf(pass))
	}
	writeJSON(w, http.StatusOK, list)
}

// handleAdminPassDisable 作废或恢复一把码，回写它改动后的样子
func (s *Server) handleAdminPassDisable(w http.ResponseWriter, r *http.Request) {
	var req passDisableRequest
	if err := decodeJSON(r, maxRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}

	code, err := requirePassCode(req.Code)
	if err != nil {
		writeError(w, err)
		return
	}

	pass, err := s.quota.SetPassDisabled(code, req.Disabled)
	if err != nil {
		writeError(w, passError(err))
		return
	}

	writeJSON(w, http.StatusOK, adminPassOf(pass))
}

// requirePassCode 规范化并校验一个通行码，分隔符与大小写随便写
func requirePassCode(raw string) (string, error) {
	code := quota.NormalizePass(raw)
	if code == "" {
		return "", badRequest("通行码缺失")
	}
	return code, nil
}
