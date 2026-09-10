package bazi

import "github.com/6tail/tyme4go/tyme"

// FourPillars 四柱
type FourPillars struct {
	Year  tyme.SixtyCycle
	Month tyme.SixtyCycle
	Day   tyme.SixtyCycle
	Hour  tyme.SixtyCycle
}

// SixtyCycleOf 由天干与地支定位六十甲子
//
// 六十甲子的序号同时满足 `index % 10 == 干序` 与 `index % 12 == 支序`，
// 干支阴阳一致时解唯一，按同余式直接算出来，不必查表也不必按名字反查
func SixtyCycleOf(stem tyme.HeavenStem, branch tyme.EarthBranch) tyme.SixtyCycle {
	stemIndex := stem.GetIndex()
	// 支序与干序之差必为偶数，5 是 5 关于模 6 的逆元
	diff := ((branch.GetIndex()-stemIndex)%12 + 12) % 12
	k := (5 * (diff / 2)) % 6
	return tyme.SixtyCycle{}.FromIndex(stemIndex + 10*k)
}

// HourStemOf 五鼠遁，由日干与时支推时干
//
// `时干 = (日干序 % 5 * 2 + 时支序) % 10`，甲为 0、子为 0
func HourStemOf(dayStem tyme.HeavenStem, hourBranch tyme.EarthBranch) tyme.HeavenStem {
	return tyme.HeavenStem{}.FromIndex((dayStem.GetIndex()%5*2 + hourBranch.GetIndex()) % 10)
}

// MonthStemOf 五虎遁，由年干与月支推月干
//
// `月干 = (年干序 % 5 * 2 + 2 + 月序) % 10`，寅月月序为 0。
// tyme 内部已按此推月柱，这里单独导出用于交叉校验
func MonthStemOf(yearStem tyme.HeavenStem, monthIndexFromTiger int) tyme.HeavenStem {
	return tyme.HeavenStem{}.FromIndex((yearStem.GetIndex()%5*2 + 2 + monthIndexFromTiger) % 10)
}

// 子时的地支序号
const ziBranchIndex = 0

// 晚子时的起点小时
const lateZiHour = 23

// BuildFourPillars 排四柱
//
// 年柱以立春交节时刻为界、月柱以十二节为界、日柱六十甲子连续计数、时柱按十二时辰，
// 这四条 tyme 已经实现且节气取自寿星天文历，直接复用。
//
// 自实现的只有早晚子时分支：tyme 把 23:00 起的日柱推到次日、时干跟随次日日干，
// 相当于 lateZiAsNextDay 为 true；为 false 时把日柱退回当天并按当天日干重推时干。
// 年柱与月柱按实际时刻的节气归属算，两派相同
func BuildFourPillars(t tyme.SolarTime, lateZiAsNextDay bool) FourPillars {
	h := tyme.SixtyCycleHour{}.FromSolarTime(t)
	pillars := FourPillars{
		Year:  h.GetYear(),
		Month: h.GetMonth(),
		Day:   h.GetDay(),
		Hour:  h.GetSixtyCycle(),
	}

	// 只有 23:00 至 23:59 这一小时存在分歧，其余时刻两派一致
	if t.GetHour() != lateZiHour || lateZiAsNextDay {
		return pillars
	}

	day := pillars.Day.Next(-1)
	ziBranch := tyme.EarthBranch{}.FromIndex(ziBranchIndex)
	pillars.Day = day
	pillars.Hour = SixtyCycleOf(HourStemOf(day.GetHeavenStem(), ziBranch), ziBranch)
	return pillars
}

// SixtyCycleYearOf 一个时刻所属的干支年年份
//
// 干支年以立春为界，立春前算前一年，流月要按这个年份取
func SixtyCycleYearOf(t tyme.SolarTime) int {
	return tyme.SixtyCycleHour{}.FromSolarTime(t).
		GetSixtyCycleDay().
		GetSixtyCycleMonth().
		GetSixtyCycleYear().
		GetYear()
}
