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

// requireInt 取一个必填整数并校验范围
func requireInt(value *int, field string, min, max int) (int, error) {
	if value == nil {
		return 0, badRequest("%s 缺失", field)
	}
	if *value < min || *value > max {
		return 0, badRequest("%s 应在 %d 到 %d 之间，收到 %d", field, min, max, *value)
	}
	return *value, nil
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
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBytes))
	if err != nil {
		err = badRequest("读取请求体失败")
		return
	}

	var req paipanRequest
	if err = json.Unmarshal(body, &req); err != nil {
		err = badRequest("请求体不是合法的 JSON")
		return
	}

	year, err := requireInt(req.Year, "year", 1, 9999)
	if err != nil {
		return
	}
	month, err := requireInt(req.Month, "month", 1, 12)
	if err != nil {
		return
	}
	day, err := requireInt(req.Day, "day", 1, 31)
	if err != nil {
		return
	}
	if err = requireRealDate(year, month, day); err != nil {
		return
	}

	hour, err := requireInt(req.Hour, "hour", 0, 23)
	if err != nil {
		return
	}
	minute, err := requireInt(req.Minute, "minute", 0, 59)
	if err != nil {
		return
	}

	gender, err := requireGender(req.Gender)
	if err != nil {
		return
	}

	if err = checkFloatRange(req.Longitude, "longitude", -180, 180); err != nil {
		return
	}
	if err = checkFloatRange(req.Latitude, "latitude", -90, 90); err != nil {
		return
	}
	if err = checkOptions(req.Options); err != nil {
		return
	}

	input = bazi.Input{
		Year:      year,
		Month:     month,
		Day:       day,
		Hour:      hour,
		Minute:    minute,
		Gender:    gender,
		Name:      strings.TrimSpace(req.Name),
		Location:  strings.TrimSpace(req.Location),
		Longitude: req.Longitude,
		Latitude:  req.Latitude,
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

	options = bazi.ResolveOptions(req.Options)
	if options.UseTrueSolarTime && input.Longitude == nil {
		err = badRequest("开启真太阳时需要提供 regionCode 或 longitude")
		return
	}
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
