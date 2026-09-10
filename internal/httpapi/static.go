package httpapi

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// assetsDir Vite 输出的带哈希文件名的目录，可以长期缓存
const assetsDir = "assets/"

// spaHandler 提供前端构建产物：命中静态文件直接返回，其余路径回退到 index.html 交给前端路由
//
// 构建产物由 main 包内嵌，未构建时目录里只有占位文件，此时提示先构建
type spaHandler struct {
	fsys  fs.FS
	files http.Handler
}

func newSPAHandler(fsys fs.FS) http.Handler {
	return &spaHandler{fsys: fsys, files: http.FileServerFS(fsys)}
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name != "" && name != "index.html" {
		if info, err := fs.Stat(h.fsys, name); err == nil && !info.IsDir() {
			if strings.HasPrefix(name, assetsDir) {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			h.files.ServeHTTP(w, r)
			return
		}
	}

	index, err := fs.ReadFile(h.fsys, "index.html")
	if err != nil {
		http.Error(w, "前端未构建，先执行 make web", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(index)
}
