package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/report"
)

// 分享：持有报告 id 的人开启、改密码或取消分享，持有分享哈希的人查看
const (
	// shareRequestBytes 分享请求体上限，可能带一份排盘输入与整篇解读正文
	shareRequestBytes = 256 << 10
	// passwordMaxRunes 分享密码的长度上限
	passwordMaxRunes = 64
	// unlockMaxFailures 同一分享连续输错这么多次密码后进入冷却
	unlockMaxFailures = 5
	// unlockCooldown 冷却时长
	unlockCooldown = 30 * time.Second
	// unlockEntryTTL 多久没有再输错就把计数丢掉
	unlockEntryTTL = 10 * time.Minute
)

// reportIDPattern 报告 id 是客户端生成的 128 位随机数，32 位十六进制
var reportIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// shareHashPattern 分享哈希是 8 字节随机数的 base64url 编码
var shareHashPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// shareInfo 分享的对外描述
type shareInfo struct {
	Hash      string    `json:"hash"`
	Locked    bool      `json:"locked"`
	CreatedAt time.Time `json:"createdAt"`
}

func infoOf(share report.Share) shareInfo {
	return shareInfo{Hash: share.Hash, Locked: share.Locked(), CreatedAt: share.CreatedAt}
}

// shareRequest 开启分享或改密码
//
// 报告尚未保存时随请求带上体系、排盘输入与选项；客户端本地有解读正文时也带上，以它为准写进报告。
// system 缺省按八字，兼容早期客户端
type shareRequest struct {
	System   string          `json:"system"`
	Password string          `json:"password"`
	Input    *birth.Input    `json:"input"`
	Options  json.RawMessage `json:"options"`
	Analysis string          `json:"analysis"`
}

// unlockRequest 输入密码查看有密码的分享
type unlockRequest struct {
	Password string `json:"password"`
}

// sharedReport 分享出去的报告内容，选项按体系原样透传
type sharedReport struct {
	System    string          `json:"system"`
	Input     birth.Input     `json:"input"`
	Options   json.RawMessage `json:"options"`
	Analysis  string          `json:"analysis"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// sharedResponse 查看分享的响应：有密码且尚未验证时只给 locked
type sharedResponse struct {
	Locked bool          `json:"locked"`
	Report *sharedReport `json:"report,omitempty"`
}

func sharedOf(item report.Report) sharedResponse {
	return sharedResponse{
		Report: &sharedReport{
			System:    item.System,
			Input:     item.Input,
			Options:   item.Options,
			Analysis:  item.Analysis,
			CreatedAt: item.CreatedAt,
			UpdatedAt: item.UpdatedAt,
		},
	}
}

// requireReportID 校验路径里的报告 id
func requireReportID(id string) (string, error) {
	if !reportIDPattern.MatchString(id) {
		return "", badRequest("报告 id 应为 32 位十六进制")
	}
	return id, nil
}

// requireShareHash 校验路径里的分享哈希
func requireShareHash(hash string) (string, error) {
	if !shareHashPattern.MatchString(hash) {
		return "", notFound("分享不存在")
	}
	return hash, nil
}

// checkPassword 校验密码长度，空串表示不设密码
func checkPassword(password string) error {
	if utf8.RuneCountInString(password) > passwordMaxRunes {
		return badRequest("密码最长 %d 个字符", passwordMaxRunes)
	}
	return nil
}

// handleGetShare 查询报告的分享状态，未分享返回 404
func (s *Server) handleGetShare(w http.ResponseWriter, r *http.Request) {
	id, err := requireReportID(r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}

	item, err := s.reports.Get(id)
	if err != nil {
		writeError(w, reportError(err))
		return
	}
	if item.Share == nil {
		writeError(w, notFound("报告尚未分享"))
		return
	}

	writeJSON(w, http.StatusOK, infoOf(*item.Share))
}

// handleCreateShare 开启分享或更新密码
//
// 报告尚未在服务端保存时（还没解读过），请求体里的 input 与 options 会先存成报告；
// 带 analysis 时正文也一并写入，解读只存在客户端本地的报告由此补齐
func (s *Server) handleCreateShare(w http.ResponseWriter, r *http.Request) {
	id, err := requireReportID(r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}

	var req shareRequest
	if err = decodeJSON(r, shareRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}
	if err = checkPassword(req.Password); err != nil {
		writeError(w, err)
		return
	}

	if req.Input != nil {
		var options json.RawMessage
		if options, err = validateForSystem(req.System, *req.Input, req.Options); err != nil {
			writeError(w, err)
			return
		}
		if err = s.reports.Upsert(id, systemOf(req.System), *req.Input, options); err != nil {
			writeError(w, err)
			return
		}
	}
	if req.Analysis != "" {
		if err = s.reports.SaveAnalysis(id, "", req.Analysis); err != nil {
			writeError(w, reportError(err))
			return
		}
	}

	share, err := s.reports.Share(id, req.Password)
	if err != nil {
		writeError(w, reportError(err))
		return
	}

	writeJSON(w, http.StatusOK, infoOf(share))
}

// handleDeleteShare 取消分享
func (s *Server) handleDeleteShare(w http.ResponseWriter, r *http.Request) {
	id, err := requireReportID(r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}

	if err = s.reports.Unshare(id); err != nil {
		writeError(w, reportError(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleShared 查看分享，有密码时只返回 locked，正文要经 unlock 拿
func (s *Server) handleShared(w http.ResponseWriter, r *http.Request) {
	hash, err := requireShareHash(r.PathValue("hash"))
	if err != nil {
		writeError(w, err)
		return
	}

	item, err := s.reports.Shared(hash)
	if err != nil {
		writeError(w, shareError(err))
		return
	}
	if item.Share.Locked() {
		writeJSON(w, http.StatusOK, sharedResponse{Locked: true})
		return
	}

	writeJSON(w, http.StatusOK, sharedOf(item))
}

// handleUnlock 输入密码查看分享，连续输错进入冷却
func (s *Server) handleUnlock(w http.ResponseWriter, r *http.Request) {
	hash, err := requireShareHash(r.PathValue("hash"))
	if err != nil {
		writeError(w, err)
		return
	}

	var req unlockRequest
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		writeError(w, err)
		return
	}

	if !s.unlocks.allow(hash) {
		writeError(w, apiError{
			status:  http.StatusTooManyRequests,
			message: "密码错误次数过多，请稍后再试",
		})
		return
	}

	item, err := s.reports.Shared(hash)
	if err != nil {
		writeError(w, shareError(err))
		return
	}
	if !item.Share.Check(req.Password) {
		s.unlocks.fail(hash)
		writeError(w, apiError{status: http.StatusForbidden, message: "密码不正确"})
		return
	}

	s.unlocks.reset(hash)
	writeJSON(w, http.StatusOK, sharedOf(item))
}

// reportError 把存储层的未找到转成 404，其余原样交给统一处理转 500
func reportError(err error) error {
	if errors.Is(err, report.ErrNotFound) {
		return notFound("报告不存在")
	}
	return err
}

// shareError 按哈希查不到时的 404，措辞对准分享而不是报告
func shareError(err error) error {
	if errors.Is(err, report.ErrNotFound) {
		return notFound("分享不存在")
	}
	return err
}

// unlockLimiter 按分享哈希记密码错误次数，连续错满后一段时间内拒绝再试
type unlockLimiter struct {
	mu      sync.Mutex
	entries map[string]*unlockEntry
}

type unlockEntry struct {
	failures     int
	lastFailure  time.Time
	blockedUntil time.Time
}

func newUnlockLimiter() *unlockLimiter {
	return &unlockLimiter{entries: map[string]*unlockEntry{}}
}

// allow 当前是否允许尝试
func (l *unlockLimiter) allow(hash string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.entries[hash]
	return !ok || time.Now().After(entry.blockedUntil)
}

// fail 记一次失败，达到上限就进入冷却；顺手清掉久未活动的记录
func (l *unlockLimiter) fail(hash string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	for key, entry := range l.entries {
		if now.Sub(entry.lastFailure) > unlockEntryTTL {
			delete(l.entries, key)
		}
	}

	entry, ok := l.entries[hash]
	if !ok {
		entry = &unlockEntry{}
		l.entries[hash] = entry
	}
	entry.failures++
	entry.lastFailure = now
	if entry.failures >= unlockMaxFailures {
		entry.failures = 0
		entry.blockedUntil = now.Add(unlockCooldown)
	}
}

// reset 密码正确，清掉计数
func (l *unlockLimiter) reset(hash string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, hash)
}
