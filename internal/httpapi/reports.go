package httpapi

import "net/http"

// handleGetReport 按 id 取报告
//
// id 是客户端生成的 128 位随机数，只有排盘的人自己知道，持有 id 即可查看这份报告；
// 报告页的地址带着它，解读中途断开后重新打开页面就靠它取回已经生成的正文
func (s *Server) handleGetReport(w http.ResponseWriter, r *http.Request) {
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

	writeJSON(w, http.StatusOK, contentOf(item))
}
