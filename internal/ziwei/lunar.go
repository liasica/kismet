package ziwei

import "github.com/6tail/tyme4go/tyme"

// lunarBirth 排盘用到的农历生辰，hourBranch 是时支索引
type lunarBirth struct {
	year           int
	yearSixtyCycle string
	month          int
	leap           bool
	day            int
	effectiveMonth int
	hourBranch     int
	text           string
}

// hourBranchIndex 钟表小时对应的时支索引，23 点与 0 点同属子
func hourBranchIndex(hour int) int {
	return ((hour + 1) / 2) % 12
}

// effectiveMonthOf 安星所用的月份：闰月初一至十五按本月，十六起按下一个月，闰十二月十六起按正月
func effectiveMonthOf(month int, leap bool, day int) int {
	if !leap || day <= 15 {
		return month
	}
	if month == 12 {
		return 1
	}
	return month + 1
}

// lunarBirthOf 从校正后的时刻取农历生辰，lateZiAsNextDay 打开时把 23 点推到次日
func lunarBirthOf(effective tyme.SolarTime, lateZiAsNextDay bool) lunarBirth {
	solarDay := effective.GetSolarDay()
	if lateZiAsNextDay && effective.GetHour() == 23 {
		solarDay = solarDay.Next(1)
	}
	lunarDay := solarDay.GetLunarDay()
	lunarMonth := lunarDay.GetLunarMonth()
	lunarYear := lunarMonth.GetLunarYear()

	month := lunarMonth.GetMonthWithLeap()
	if month < 0 {
		month = -month
	}
	leap := lunarMonth.IsLeap()
	day := lunarDay.GetDay()

	return lunarBirth{
		year:           lunarYear.GetYear(),
		yearSixtyCycle: lunarYear.GetSixtyCycle().GetName(),
		month:          month,
		leap:           leap,
		day:            day,
		effectiveMonth: effectiveMonthOf(month, leap, day),
		hourBranch:     hourBranchIndex(effective.GetHour()),
		text:           lunarDay.String(),
	}
}
