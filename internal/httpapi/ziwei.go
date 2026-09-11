package httpapi

import (
	"fmt"
	"net/http"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/region"
	"github.com/liasica/kismet/internal/ziwei"
)

// 紫微斗数的排盘接口与请求解析，结构与八字的一一对应

// checkZiweiOptions 校验选项里有范围要求的那几项
func checkZiweiOptions(patch ziwei.OptionsPatch) error {
	if patch.MaxAge != nil && (*patch.MaxAge < 1 || *patch.MaxAge > 200) {
		return badRequest("options.maxAge 应在 1 到 200 之间，收到 %d", *patch.MaxAge)
	}
	return nil
}

// resolveZiweiOptions 校验选项并合并默认值，再确认真太阳时有经度可用；patch 为 nil 即全用默认值
func resolveZiweiOptions(input birth.Input, patch *ziwei.OptionsPatch) (ziwei.Options, error) {
	options := ziwei.DefaultOptions
	if patch != nil {
		if err := checkZiweiOptions(*patch); err != nil {
			return ziwei.Options{}, err
		}
		options = ziwei.ResolveOptions(*patch)
	}
	if options.UseTrueSolarTime && input.Longitude == nil {
		return ziwei.Options{}, badRequest("开启真太阳时需要提供 regionCode 或 longitude")
	}
	return options, nil
}

// resolveZiweiChart 校验排盘输入与选项并排盘
func resolveZiweiChart(input birth.Input, patch *ziwei.OptionsPatch) (ziwei.Chart, error) {
	if err := checkInput(input); err != nil {
		return ziwei.Chart{}, err
	}
	options, err := resolveZiweiOptions(input, patch)
	if err != nil {
		return ziwei.Chart{}, err
	}

	var chart ziwei.Chart
	if chart, err = ziwei.Paipan(input, options); err != nil {
		return ziwei.Chart{}, badRequest("排盘失败：%s", err.Error())
	}
	return chart, nil
}

// validateZiweiChart 校验一份要保存的排盘输入与选项，并实际排一次盘确认能算出来
func validateZiweiChart(input birth.Input, patch *ziwei.OptionsPatch) (ziwei.Options, error) {
	chart, err := resolveZiweiChart(input, patch)
	if err != nil {
		return ziwei.Options{}, err
	}
	return chart.Options, nil
}

// parseZiweiPaipanRequest 解析并校验紫微排盘请求
func parseZiweiPaipanRequest(
	r *http.Request,
	store *region.Store,
) (input birth.Input, options ziwei.Options, err error) {
	var req paipanRequest
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}
	if input, err = parseBirth(req.birthRequest, store); err != nil {
		return
	}

	var patch *ziwei.OptionsPatch
	if patch, err = decodeOptions[ziwei.OptionsPatch](req.Options); err != nil {
		return
	}
	options, err = resolveZiweiOptions(input, patch)
	return
}

// handleZiweiPaipan 紫微排盘，`?format=text` 返回文字命盘
func (s *Server) handleZiweiPaipan(w http.ResponseWriter, r *http.Request) {
	input, options, err := parseZiweiPaipanRequest(r, s.store)
	if err != nil {
		writeError(w, err)
		return
	}

	chart, err := ziwei.Paipan(input, options)
	if err != nil {
		writeError(w, badRequest("排盘失败：%s", err.Error()))
		return
	}

	if r.URL.Query().Get("format") == "text" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = fmt.Fprintln(w, ziwei.ToText(chart))
		return
	}
	writeJSON(w, http.StatusOK, chart)
}
