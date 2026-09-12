// Package httpapi 排盘与行政区划的 HTTP 接口
//
// Web 端直接引 @kismet/core 在本地算，不经过这里；这一层是给不能复用 TypeScript
// 包的客户端（原生 app、其他语言的服务）用的，本身只做请求解析与转发，不含排盘逻辑
package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/bazi"
	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/region"
	"github.com/liasica/kismet/internal/report"
	"github.com/liasica/kismet/internal/ziwei"
)

// 请求体的大小上限，排盘请求只有几百字节
const maxRequestBytes = 64 << 10

// regionCodePattern 前三级 6 位、乡镇 9 位
var regionCodePattern = regexp.MustCompile(`^\d{6}(\d{3})?$`)

// apiError 带状态码的错误，交给统一的响应函数转成 JSON
type apiError struct {
	status  int
	message string
	// code 机器可读的标识，前端据此认出这一类错误，为空时不输出
	code string
}

func (e apiError) Error() string {
	return e.message
}

func badRequest(format string, args ...any) apiError {
	return apiError{status: http.StatusBadRequest, message: fmt.Sprintf(format, args...)}
}

func notFound(format string, args ...any) apiError {
	return apiError{status: http.StatusNotFound, message: fmt.Sprintf(format, args...)}
}

// birthRequest 排盘请求里的出生信息，各体系共用
//
// 出生地可以传 RegionCode 让服务端查经纬度，也可以直接传 Longitude。
// 两者都给时以 RegionCode 为准
type birthRequest struct {
	Year   *int   `json:"year"`
	Month  *int   `json:"month"`
	Day    *int   `json:"day"`
	Hour   *int   `json:"hour"`
	Minute *int   `json:"minute"`
	Gender string `json:"gender"`

	Name     string `json:"name"`
	Location string `json:"location"`
	// RegionCode 区划代码，服务端据此查经纬度与完整地名
	RegionCode string   `json:"regionCode"`
	Longitude  *float64 `json:"longitude"`
	Latitude   *float64 `json:"latitude"`
}

// paipanRequest 排盘请求体：出生信息加该体系的选项，选项按体系再解析
type paipanRequest struct {
	birthRequest
	Options json.RawMessage `json:"options"`
}

// decodeOptions 把原始 JSON 解成某个体系的选项补丁，没给或为 null 时返回 nil
//
// 禁止未知字段：不同体系的选项补丁字段集合可能互为子集，缺省体系或传错体系时，
// 混进来的选项本应在这里报错，而不是被当成合法的另一体系选项悄悄解析成功
func decodeOptions[T any](raw json.RawMessage) (*T, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var patch T
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&patch); err != nil {
		return nil, badRequest("options 不是合法的选项对象")
	}
	return &patch, nil
}

// marshalOptions 把合并后的选项序列化，存进报告
func marshalOptions(value any) (json.RawMessage, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

// decodeJSON 读请求体并解析 JSON，limit 是允许的最大字节数
func decodeJSON(r *http.Request, limit int64, value any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, limit))
	if err != nil {
		return badRequest("读取请求体失败")
	}
	if err = json.Unmarshal(body, value); err != nil {
		return badRequest("请求体不是合法的 JSON")
	}
	return nil
}

// requireInt 取一个必填整数
func requireInt(value *int, field string) (int, error) {
	if value == nil {
		return 0, badRequest("%s 缺失", field)
	}
	return *value, nil
}

// checkInput 校验排盘输入：各时间分量的范围、日期是否真实存在、性别与经纬度
func checkInput(input birth.Input) error {
	ranges := []struct {
		value    int
		field    string
		min, max int
	}{
		{input.Year, "year", 1, 9999},
		{input.Month, "month", 1, 12},
		{input.Day, "day", 1, 31},
		{input.Hour, "hour", 0, 23},
		{input.Minute, "minute", 0, 59},
	}
	for _, item := range ranges {
		if item.value < item.min || item.value > item.max {
			return badRequest("%s 应在 %d 到 %d 之间，收到 %d", item.field, item.min, item.max, item.value)
		}
	}

	err := requireRealDate(input.Year, input.Month, input.Day)
	if err != nil {
		return err
	}
	if _, err = requireGender(string(input.Gender)); err != nil {
		return err
	}
	if err = checkFloatRange(input.Longitude, "longitude", -180, 180); err != nil {
		return err
	}
	return checkFloatRange(input.Latitude, "latitude", -90, 90)
}

// parseBirth 由请求字段组装排盘输入并校验，带区划代码时查经纬度与地名
func parseBirth(req birthRequest, store *region.Store) (input birth.Input, err error) {
	input = birth.Input{
		Gender:    birth.Gender(req.Gender),
		Name:      strings.TrimSpace(req.Name),
		Location:  strings.TrimSpace(req.Location),
		Longitude: req.Longitude,
		Latitude:  req.Latitude,
	}
	if input.Year, err = requireInt(req.Year, "year"); err != nil {
		return
	}
	if input.Month, err = requireInt(req.Month, "month"); err != nil {
		return
	}
	if input.Day, err = requireInt(req.Day, "day"); err != nil {
		return
	}
	if input.Hour, err = requireInt(req.Hour, "hour"); err != nil {
		return
	}
	if input.Minute, err = requireInt(req.Minute, "minute"); err != nil {
		return
	}
	if err = checkInput(input); err != nil {
		return
	}

	if code := strings.TrimSpace(req.RegionCode); code != "" {
		if !regionCodePattern.MatchString(code) {
			err = badRequest("regionCode 应为 6 位或 9 位的区划代码")
			return
		}
		found, ok := store.Find(code)
		if !ok {
			err = notFound("区划代码 %s 不存在", code)
			return
		}
		longitude := found.Lng
		latitude := found.Lat
		input.Longitude = &longitude
		input.Latitude = &latitude
		input.Location = store.FullName(code)
	}
	return
}

// parseBaziPaipanRequest 解析并校验八字排盘请求
func parseBaziPaipanRequest(
	r *http.Request,
	store *region.Store,
) (input birth.Input, options bazi.Options, err error) {
	var req paipanRequest
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}
	if input, err = parseBirth(req.birthRequest, store); err != nil {
		return
	}

	var patch *bazi.OptionsPatch
	if patch, err = decodeOptions[bazi.OptionsPatch](req.Options); err != nil {
		return
	}
	options, err = resolveBaziOptions(input, patch)
	return
}

// resolveBaziOptions 校验选项并合并默认值，再确认真太阳时有经度可用；patch 为 nil 即全用默认值
func resolveBaziOptions(input birth.Input, patch *bazi.OptionsPatch) (bazi.Options, error) {
	options := bazi.DefaultOptions
	if patch != nil {
		if err := checkBaziOptions(*patch); err != nil {
			return bazi.Options{}, err
		}
		options = bazi.ResolveOptions(*patch)
	}
	if options.UseTrueSolarTime && input.Longitude == nil {
		return bazi.Options{}, badRequest("开启真太阳时需要提供 regionCode 或 longitude")
	}
	return options, nil
}

// resolveBaziChart 校验排盘输入与选项并排盘
func resolveBaziChart(input birth.Input, patch *bazi.OptionsPatch) (bazi.Chart, error) {
	if err := checkInput(input); err != nil {
		return bazi.Chart{}, err
	}
	options, err := resolveBaziOptions(input, patch)
	if err != nil {
		return bazi.Chart{}, err
	}

	var chart bazi.Chart
	if chart, err = bazi.Paipan(input, options); err != nil {
		return bazi.Chart{}, badRequest("排盘失败：%s", err.Error())
	}
	return chart, nil
}

// validateBaziChart 校验一份要保存的排盘输入与选项，并实际排一次盘确认能算出来
func validateBaziChart(input birth.Input, patch *bazi.OptionsPatch) (bazi.Options, error) {
	chart, err := resolveBaziChart(input, patch)
	if err != nil {
		return bazi.Options{}, err
	}
	return chart.Options, nil
}

// checkFloatRange 校验可选浮点数的范围
func checkFloatRange(value *float64, field string, min, max float64) error {
	if value == nil {
		return nil
	}
	if *value < min || *value > max {
		return badRequest("%s 应在 %v 到 %v 之间，收到 %v", field, min, max, *value)
	}
	return nil
}

// requireRealDate 公历日期是否真实存在，挡掉 2 月 30 日这类
func requireRealDate(year, month, day int) error {
	t := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
	if t.Year() != year || int(t.Month()) != month || t.Day() != day {
		return badRequest("公历 %d 年 %d 月没有 %d 日", year, month, day)
	}
	return nil
}

// requireGender 校验性别
func requireGender(value string) (birth.Gender, error) {
	switch birth.Gender(value) {
	case birth.GenderMale:
		return birth.GenderMale, nil
	case birth.GenderFemale:
		return birth.GenderFemale, nil
	}
	return "", badRequest(`gender 应为 "male" 或 "female"`)
}

// checkBaziOptions 校验选项里有范围要求的那几项
func checkBaziOptions(patch bazi.OptionsPatch) error {
	if patch.QiYunPrecision != nil {
		switch *patch.QiYunPrecision {
		case bazi.QiYunByDay, bazi.QiYunByHour:
		default:
			return badRequest(`options.qiYunPrecision 应为 "day" 或 "hour"`)
		}
	}
	if patch.MaxAge != nil && (*patch.MaxAge < 1 || *patch.MaxAge > 200) {
		return badRequest("options.maxAge 应在 1 到 200 之间，收到 %d", *patch.MaxAge)
	}
	if patch.ElementStrategy != nil {
		if _, err := bazi.GetElementStrategy(*patch.ElementStrategy); err != nil {
			return badRequest("%s", err.Error())
		}
	}
	return nil
}

// requireRegionCode 校验路径里的区划代码
func requireRegionCode(code string) (string, error) {
	if !regionCodePattern.MatchString(code) {
		return "", badRequest("区划代码应为 6 位或 9 位数字")
	}
	return code, nil
}

// statusOf 取错误对应的状态码与文案
func statusOf(err error) (int, string) {
	var e apiError
	if errors.As(err, &e) {
		return e.status, e.message
	}
	return http.StatusInternalServerError, "服务内部错误"
}

// systemOf 请求里的体系名，缺省按八字
func systemOf(system string) string {
	if system == "" {
		return report.SystemBazi
	}
	return system
}

// validateForSystem 按体系校验一份要保存的输入与选项，返回合并默认值后的选项 JSON
func validateForSystem(system string, input birth.Input, raw json.RawMessage) (json.RawMessage, error) {
	switch systemOf(system) {
	case report.SystemBazi:
		patch, err := decodeOptions[bazi.OptionsPatch](raw)
		if err != nil {
			return nil, err
		}
		var options bazi.Options
		if options, err = validateBaziChart(input, patch); err != nil {
			return nil, err
		}
		return marshalOptions(options)
	case report.SystemZiwei:
		patch, err := decodeOptions[ziwei.OptionsPatch](raw)
		if err != nil {
			return nil, err
		}
		var options ziwei.Options
		if options, err = validateZiweiChart(input, patch); err != nil {
			return nil, err
		}
		return marshalOptions(options)
	}
	return nil, badRequest(`system 应为 "bazi" 或 "ziwei"`)
}
