// 遇见：命理排盘与解读
//
// 单个二进制：前端构建产物与区划数据都用 `go:embed` 编进来。
// 排盘算法在 internal/bazi，与 Web 端的 TypeScript 实现逐字段一致；
// 区划数据在 internal/region，与 Web 端读同一份 JSON；
// 命理解读在 internal/httpapi 转发给 DeepSeek，密钥只留在服务端；
// 紫微解读的讲义切片在 data/ziwei，随二进制内嵌
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/httpapi"
	"github.com/liasica/kismet/internal/region"
	"github.com/liasica/kismet/internal/report"
	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

// 读写超时，排盘是纯计算几毫秒就够；解读接口流式输出时间长，自行延长写超时
const (
	readTimeout  = 10 * time.Second
	writeTimeout = 30 * time.Second
)

//go:embed data/region
var regionData embed.FS

//go:embed data/ziwei
var ziweiData embed.FS

//go:embed all:web/app/dist
var webDist embed.FS

func main() {
	regionFS, err := fs.Sub(regionData, "data/region")
	if err != nil {
		fail("定位区划数据失败 %v", err)
	}
	store, err := region.Load(regionFS)
	if err != nil {
		fail("载入区划数据失败 %v", err)
	}

	webFS, err := fs.Sub(webDist, "web/app/dist")
	if err != nil {
		fail("定位前端产物失败 %v", err)
	}

	reports, err := report.Open(dbPath())
	if err != nil {
		fail("打开数据文件失败 %v", err)
	}

	knowledgeFS, err := fs.Sub(ziweiData, "data/ziwei")
	if err != nil {
		fail("定位知识库失败 %v", err)
	}
	lib, err := knowledge.Load(knowledgeFS)
	if err != nil {
		fail("载入知识库失败 %v", err)
	}
	if missing := lib.Validate(); len(missing) > 0 {
		fail("知识库缺 %d 个键，先跑 go run ./tools/ziweikb", len(missing))
	}

	deepSeek := httpapi.DeepSeekConfigFromEnv()
	admin := adminPassword()
	addr := ":" + port()
	server := &http.Server{
		Addr:         addr,
		Handler:      httpapi.NewServer(store, deepSeek, reports, lib, admin, webFS).Handler(),
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
	}

	_, _ = fmt.Fprintf(os.Stdout, "遇见 http://localhost%s\n", addr)
	_, _ = fmt.Fprintf(os.Stdout, "数据文件 %s\n", dbPath())
	if deepSeek.Enabled() {
		_, _ = fmt.Fprintf(os.Stdout, "命理解读 %s %s\n", deepSeek.BaseURL, deepSeek.Model)
	} else {
		_, _ = fmt.Fprintln(os.Stdout, "命理解读 未配置 DEEPSEEK_API_KEY，接口返回 503")
	}
	if admin != "" {
		_, _ = fmt.Fprintf(os.Stdout, "后台管理 http://localhost%s/admin\n", addr)
	} else {
		_, _ = fmt.Fprintln(os.Stdout, "后台管理 未配置 ADMIN_PASSWORD，接口返回 503")
	}

	err = server.ListenAndServe()
	_ = reports.Close()
	fail("服务退出 %v", err)
}

// fail 打印错误并退出
func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

// port 监听端口，取环境变量 PORT
func port() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return "36579"
}

// adminPassword 后台管理的密码，取环境变量 ADMIN_PASSWORD，为空即不开放后台
func adminPassword() string {
	return strings.TrimSpace(os.Getenv("ADMIN_PASSWORD"))
}

// dbPath 报告数据文件的路径，取环境变量 DB_PATH
func dbPath() string {
	if p := os.Getenv("DB_PATH"); p != "" {
		return p
	}
	return "kismet.db"
}
