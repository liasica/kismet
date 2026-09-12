package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/liasica/kismet/internal/bazi"
	"github.com/liasica/kismet/internal/quota"
	"github.com/liasica/kismet/internal/region"
	"github.com/liasica/kismet/internal/report"
	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

// Server 接口层，持有区划数据、DeepSeek 配置、报告存储、后台密码与前端构建产物
type Server struct {
	store    *region.Store
	deepSeek DeepSeekConfig
	// deepSeekKeys 密钥分配器，并发的解读各占一把
	deepSeekKeys *keyring
	reports      *report.Store
	// knowledge 紫微解读的讲义切片
	knowledge *knowledge.Library
	// quota 免费解读次数的配额
	quota   *quota.Store
	unlocks *unlockLimiter
	// adminPassword 后台管理的密码，为空即不开放后台
	adminPassword string
	// adminLimiter 管理密码的错误计数
	adminLimiter *unlockLimiter
	// realIPHeader 反代放真实 IP 的头，启动时读一次
	realIPHeader string
	web          fs.FS
}

// NewServer 构造接口层，web 是前端构建产物的根目录，adminPassword 为空时后台接口返回 503
func NewServer(
	store *region.Store,
	deepSeek DeepSeekConfig,
	reports *report.Store,
	lib *knowledge.Library,
	usage *quota.Store,
	adminPassword string,
	web fs.FS,
) *Server {
	return &Server{
		store:         store,
		deepSeek:      deepSeek,
		deepSeekKeys:  newKeyring(deepSeek.Keys),
		reports:       reports,
		knowledge:     lib,
		quota:         usage,
		unlocks:       newUnlockLimiter(),
		adminPassword: adminPassword,
		adminLimiter:  newUnlockLimiter(),
		realIPHeader:  realIPHeader(),
		web:           web,
	}
}

// writeJSON 输出 JSON
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "写响应失败 %v\n", err)
	}
}

// writeError 把错误转成 JSON
func writeError(w http.ResponseWriter, err error) {
	status, message := statusOf(err)
	if status == http.StatusInternalServerError {
		_, _ = fmt.Fprintf(os.Stderr, "未预期的错误 %v\n", err)
	}

	body := map[string]string{"error": message}
	var detailed apiError
	if errors.As(err, &detailed) && detailed.code != "" {
		body["code"] = detailed.code
	}
	writeJSON(w, status, body)
}

// cors 接口不带 cookie，后台鉴权只经 Authorization 头，默认放开来源
//
// 收紧用环境变量 ALLOWED_ORIGINS，逗号分隔
func cors(next http.Handler) http.Handler {
	allowed := strings.TrimSpace(os.Getenv("ALLOWED_ORIGINS"))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := "*"
		if allowed != "" {
			origin = ""
			for _, candidate := range strings.Split(allowed, ",") {
				if strings.TrimSpace(candidate) == r.Header.Get("Origin") {
					origin = r.Header.Get("Origin")
					break
				}
			}
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization, "+fingerprintHeader+", "+accessCodeHeader,
		)

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Handler 组装路由
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("GET /api/bazi/options", s.handleBaziOptions)
	mux.HandleFunc("POST /api/bazi/paipan", s.handleBaziPaipan)
	mux.HandleFunc("POST /api/bazi/analyze", s.handleBaziAnalyze)
	mux.HandleFunc("POST /api/ziwei/paipan", s.handleZiweiPaipan)
	mux.HandleFunc("POST /api/ziwei/analyze", s.handleZiweiAnalyze)
	mux.HandleFunc("GET /api/reports/{id}", s.handleGetReport)
	mux.HandleFunc("GET /api/reports/{id}/share", s.handleGetShare)
	mux.HandleFunc("POST /api/reports/{id}/share", s.handleCreateShare)
	mux.HandleFunc("DELETE /api/reports/{id}/share", s.handleDeleteShare)
	mux.HandleFunc("GET /api/shares/{hash}", s.handleShared)
	mux.HandleFunc("POST /api/shares/{hash}/unlock", s.handleUnlock)
	mux.HandleFunc("GET /api/passes/{code}", s.handlePass)
	mux.HandleFunc("GET /api/admin/reports", s.requireAdmin(s.handleAdminReports))
	mux.HandleFunc("GET /api/admin/reports/{id}", s.requireAdmin(s.handleAdminReport))
	mux.HandleFunc("GET /api/admin/reports/{id}/usage", s.requireAdmin(s.handleAdminReportUsage))
	mux.HandleFunc("GET /api/admin/usage", s.requireAdmin(s.handleAdminUsage))
	mux.HandleFunc("GET /api/admin/quota", s.requireAdmin(s.handleAdminQuotaLimits))
	mux.HandleFunc("POST /api/admin/quota", s.requireAdmin(s.handleAdminQuota))
	mux.HandleFunc("POST /api/admin/usage/reset", s.requireAdmin(s.handleAdminUsageReset))
	mux.HandleFunc("POST /api/admin/usage/rule", s.requireAdmin(s.handleAdminUsageRule))
	mux.HandleFunc("GET /api/admin/passes", s.requireAdmin(s.handleAdminPasses))
	mux.HandleFunc("POST /api/admin/passes", s.requireAdmin(s.handleAdminPassCreate))
	mux.HandleFunc("POST /api/admin/passes/disable", s.requireAdmin(s.handleAdminPassDisable))
	mux.HandleFunc("GET /api/regions/provinces", s.handleProvinces)
	mux.HandleFunc("GET /api/regions/search", s.handleSearch)
	mux.HandleFunc("GET /api/regions/{code}", s.handleRegion)
	mux.HandleFunc("GET /api/regions/{code}/children", s.handleChildren)
	mux.HandleFunc("GET /api/regions/{code}/towns", s.handleTowns)

	// /api 下未命中的路径返回 JSON 错误，其余路径交给前端
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "接口不存在"})
	})
	mux.Handle("/", newSPAHandler(s.web))

	return cors(mux)
}

// strategyInfo 策略的对外描述
type strategyInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// handleBaziOptions 选项的默认值与可用的五行评分策略，客户端不必硬编码一份
func (s *Server) handleBaziOptions(w http.ResponseWriter, _ *http.Request) {
	strategies := bazi.ElementStrategies()
	list := make([]strategyInfo, 0, len(strategies))
	for _, item := range strategies {
		list = append(list, strategyInfo{Name: item.Name(), Description: item.Description()})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"defaults":          bazi.DefaultOptions,
		"elementStrategies": list,
	})
}

// handleBaziPaipan 排盘
//
// `?format=text` 返回竖排文字，便于跟现有排盘工具肉眼对照
func (s *Server) handleBaziPaipan(w http.ResponseWriter, r *http.Request) {
	input, options, err := parseBaziPaipanRequest(r, s.store)
	if err != nil {
		writeError(w, err)
		return
	}

	chart, err := bazi.Paipan(input, options)
	if err != nil {
		// 越界输入在排盘核心里是普通错误，归到 400 并保留原文便于排查
		writeError(w, badRequest("排盘失败：%s", err.Error()))
		return
	}

	if r.URL.Query().Get("format") == "text" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = fmt.Fprintln(w, bazi.ToText(chart, bazi.ToTextOptions{
			Decades:       true,
			Years:         r.URL.Query().Get("years") == "1",
			Months:        r.URL.Query().Get("months") == "1",
			ElementDetail: r.URL.Query().Get("detail") == "1",
		}))
		return
	}

	writeJSON(w, http.StatusOK, chart)
}

func (s *Server) handleProvinces(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"regions": s.store.Provinces()})
}

// handleSearch 按名称跨级搜索区划
//
// `q` 是关键词，`limit` 可选。四级都会命中，结果带完整地名与代码路径，
// 客户端拿 path 就能把自己的联动面板定位到命中项
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	keyword := strings.TrimSpace(r.URL.Query().Get("q"))
	if keyword == "" {
		writeError(w, badRequest("缺少查询参数 q"))
		return
	}

	limit := region.SearchLimitDefault
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 200 {
			writeError(w, badRequest("limit 应为 1 到 200 之间的整数"))
			return
		}
		limit = parsed
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"matches": s.store.Search(keyword, limit),
	})
}

func (s *Server) handleChildren(w http.ResponseWriter, r *http.Request) {
	code, err := requireRegionCode(r.PathValue("code"))
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"regions":   s.store.Children(code),
		"hasTowns":  s.store.HasTowns(code),
		"townCount": s.store.TownCount(code),
	})
}

func (s *Server) handleTowns(w http.ResponseWriter, r *http.Request) {
	code, err := requireRegionCode(r.PathValue("code"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"regions": s.store.Towns(code)})
}

func (s *Server) handleRegion(w http.ResponseWriter, r *http.Request) {
	code, err := requireRegionCode(r.PathValue("code"))
	if err != nil {
		writeError(w, err)
		return
	}

	found, ok := s.store.Find(code)
	if !ok {
		writeError(w, notFound("区划代码 %s 不存在", code))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"region":    found,
		"fullName":  s.store.FullName(code),
		"hasTowns":  s.store.HasTowns(code),
		"townCount": s.store.TownCount(code),
	})
}
