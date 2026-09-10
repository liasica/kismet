// Package httpapi 排盘与行政区划的 HTTP 接口
//
// Web 端直接引 @kismet/core 在本地算，不经过这里；这一层是给不能复用 TypeScript
// 包的客户端（原生 app、其他语言的服务）用的，本身只做请求解析与转发，不含排盘逻辑
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/bazi"
	"github.com/liasica/kismet/internal/region"
)

// 请求体的大小上限，排盘请求只有几百字节
const maxRequestBytes = 64 << 10

// regionCodePattern 前三级 6 位、乡镇 9 位
var regionCodePattern = regexp.MustCompile(`^\d{6}(\d{3})?$`)

// apiError 带状态码的错误，交给统一的响应函数转成 JSON
type apiError struct {
	status  int
	message string
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

// paipanRequest 排盘请求体
//
// 出生地可以传 RegionCode 让服务端查经纬度，也可以直接传 Longitude。
// 两者都给时以 RegionCode 为准
type paipanRequest struct {
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

	Options bazi.OptionsPatch `json:"options"`
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
func checkInput(input bazi.Input) error {
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

// resolveChartOptions 校验选项并合并默认值，再确认真太阳时有经度可用；patch 为 nil 即全用默认值
func resolveChartOptions(input bazi.Input, patch *bazi.OptionsPatch) (bazi.Options, error) {
	options := bazi.DefaultOptions
	if patch != nil {
		if err := checkOptions(*patch); err != nil {
			return bazi.Options{}, err
		}
		options = bazi.ResolveOptions(*patch)
	}
	if options.UseTrueSolarTime && input.Longitude == nil {
		return bazi.Options{}, badRequest("开启真太阳时需要提供 regionCode 或 longitude")
	}
	return options, nil
}

// validateChart 校验一份要保存的排盘输入与选项，并实际排一次盘确认能算出来
func validateChart(input bazi.Input, patch *bazi.OptionsPatch) (bazi.Options, error) {
	if err := checkInput(input); err != nil {
		return bazi.Options{}, err
	}
	options, err := resolveChartOptions(input, patch)
	if err != nil {
		return bazi.Options{}, err
	}
	if _, err = bazi.Paipan(input, options); err != nil {
		return bazi.Options{}, badRequest("排盘失败：%s", err.Error())
	}
	return options, nil
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
func requireGender(value string) (bazi.Gender, error) {
	switch bazi.Gender(value) {
	case bazi.GenderMale:
		return bazi.GenderMale, nil
	case bazi.GenderFemale:
		return bazi.GenderFemale, nil
	}
	return "", badRequest(`gender 应为 "male" 或 "female"`)
}

// checkOptions 校验选项里有范围要求的那几项
func checkOptions(patch bazi.OptionsPatch) error {
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

// parsePaipanRequest 解析并校验排盘请求
func parsePaipanRequest(
	r *http.Request,
	store *region.Store,
) (input bazi.Input, options bazi.Options, err error) {
	var req paipanRequest
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}

	input = bazi.Input{
		Gender:    bazi.Gender(req.Gender),
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

	options, err = resolveChartOptions(input, &req.Options)
	return
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
