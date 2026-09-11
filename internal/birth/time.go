package birth

import (
	"errors"
	"fmt"
	"math"

	"github.com/6tail/tyme4go/tyme"
)

// ErrLongitudeRequired 开启真太阳时却没有给经度
var ErrLongitudeRequired = errors.New("开启真太阳时必须提供出生地经度")

// CorrectedTime 校正后的时刻与校正过程
type CorrectedTime struct {
	// Effective 实际用于排盘的时刻
	Effective tyme.SolarTime
	// Info 校正过程，其中 Zodiac 由排盘主流程按年柱地支补上
	Info TimeInfo
}

// FormatTime 把时刻格式化成 `YYYY-MM-DD HH:mm:ss`
func FormatTime(t tyme.SolarTime) string {
	return fmt.Sprintf(
		"%04d-%02d-%02d %02d:%02d:%02d",
		t.GetYear(), t.GetMonth(), t.GetDay(),
		t.GetHour(), t.GetMinute(), t.GetSecond(),
	)
}

// shiftMinutes 按分钟平移一个时刻，可跨日
func shiftMinutes(t tyme.SolarTime, minutes float64) tyme.SolarTime {
	return t.Next(int(math.Round(minutes * 60)))
}

// roundToMinute 取到最近的整分钟
//
// 输入本身只精确到分，秒位是校正累积出来的，留着会让起运折算的时辰位漂移。
// 四舍五入而不是截断：截断的偏差可达 60 秒，遇到时辰边界会把人推到前一个时辰
func roundToMinute(t tyme.SolarTime) tyme.SolarTime {
	second := t.GetSecond()
	if second >= 30 {
		return t.Next(60 - second)
	}
	return t.Next(-second)
}

// Round2 保留两位小数，避免浮点尾数进到结果里
func Round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// TermPointOf 把节气对象转换成 TermPoint
func TermPointOf(term tyme.SolarTerm) TermPoint {
	return TermPoint{
		Name: term.GetName(),
		Time: FormatTime(term.GetJulianDay().GetSolarTime()),
	}
}

// CorrectTime 校正时刻
//
// 输入一律当作北京时间的钟表读数，依次过三道校正：
//  1. 夏令时：落在 1986 至 1991 年夏令时区间的读数回拨一小时，得到标准北京时间
//  2. 经度差：地方平时 = 标准北京时间 +（经度 - 120） x 4 分钟
//  3. 均时差：真太阳时 = 地方平时 + 均时差
//
// 三道校正的偏移量都留在结果里，原始时刻与校正后时刻同时保留；Zodiac 由各体系按自己的年支补上
func CorrectTime(input Input, useTrueSolarTime, useDaylightSaving bool) (CorrectedTime, error) {
	raw, err := tyme.SolarTime{}.FromYmdHms(input.Year, input.Month, input.Day, input.Hour, input.Minute, 0)
	if err != nil {
		return CorrectedTime{}, err
	}

	standard := *raw
	daylightSavingMinutes := 0
	if useDaylightSaving &&
		IsInChinaDst(input.Year, input.Month, input.Day, input.Hour, input.Minute) {
		daylightSavingMinutes = -DstOffsetMinutes
		standard = shiftMinutes(standard, float64(daylightSavingMinutes))
	}

	longitudeMinutes := 0.0
	equationOfTimeMinutes := 0.0
	meanSolar := standard
	effective := standard

	if useTrueSolarTime {
		if input.Longitude == nil {
			return CorrectedTime{}, ErrLongitudeRequired
		}
		longitudeMinutes = (*input.Longitude - BeijingMeridian) * MinutesPerDegree
		meanSolar = shiftMinutes(standard, longitudeMinutes)
		// 均时差按标准北京时间对应的世界时求值
		equationOfTimeMinutes = EquationOfTime(
			standard.GetYear(),
			standard.GetMonth(),
			standard.GetDay(),
			standard.GetHour()-beijingUTCOffsetHours,
			standard.GetMinute(),
		)
		effective = roundToMinute(shiftMinutes(meanSolar, equationOfTimeMinutes))
	}

	// 上一个节与下一个节，用于月柱归属与起运折算的交叉核对
	jie := effective.GetTerm()
	if !jie.IsJie() {
		jie = jie.Next(-1)
	}

	return CorrectedTime{
		Effective: effective,
		Info: TimeInfo{
			Input:                 FormatTime(*raw),
			Standard:              FormatTime(standard),
			Effective:             FormatTime(effective),
			DaylightSavingMinutes: daylightSavingMinutes,
			LongitudeMinutes:      Round2(longitudeMinutes),
			EquationOfTimeMinutes: Round2(equationOfTimeMinutes),
			MeanSolar:             FormatTime(meanSolar),
			Lunar:                 effective.GetSolarDay().GetLunarDay().String(),
			Term:                  TermPointOf(effective.GetTerm()),
			PrevJie:               TermPointOf(jie),
			NextJie:               TermPointOf(jie.Next(2)),
		},
	}, nil
}
