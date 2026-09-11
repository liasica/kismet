package bazi

import (
	"fmt"
	"time"

	"github.com/6tail/tyme4go/tyme"
)

// 大运、流年、流月、小运与起运
//
// 起运的时间折算按「3 天折 1 岁、1 天折 4 个月、1 时辰折 10 天」的线性口径自己实现，
// 没有走 tyme 的 ChildLimit：那套折算挂在包级变量 tyme.ChildLimitProvider 上，
// HTTP 服务并发处理请求时改它会有竞态。折算与推进日期的算法逐步复现
// tyme 的 China95ChildLimitProvider 与 LunarSect2ChildLimitProvider，
// 以及 AbstractChildLimitProvider 的日期推进，与 TS 侧的结果逐位一致
//
// 大运与小运的干支也自己推：大运从月柱起步、小运从时柱起步，都按顺逆方向走。
// 这样晚子时算当天时，小运跟的是本模块推出的时柱

// 折算的换算基准，单位分钟：3 天折 1 岁、1 天折 4 个月、1 时辰折 10 天
const (
	minutesPerFortuneYear  = 4320
	minutesPerFortuneMonth = 360
	minutesPerFortuneDay   = 12
	minutesPerFortuneHour  = 12
)

// 一步大运的年数
const yearsPerDecade = 10

// FortuneContext 推大运所需的上下文
type FortuneContext struct {
	// BirthTime 实际用于排盘的出生时刻
	BirthTime tyme.SolarTime
	Gender    Gender
	// YearPillar 年柱，顺逆方向由它的天干阴阳与性别共同决定
	YearPillar tyme.SixtyCycle
	// MonthPillar 月柱，大运从它起步
	MonthPillar tyme.SixtyCycle
	// HourPillar 时柱，小运从它起步
	HourPillar tyme.SixtyCycle
	DayStem    tyme.HeavenStem
	Precision  QiYunPrecision
	// MaxAge 流年输出到多少虚岁
	MaxAge int
}

// qiYunDuration 起运折算出的时长
type qiYunDuration struct {
	Year   int
	Month  int
	Day    int
	Hour   int
	Minute int
}

// splitQiYun 把出生到交节的秒数折算成年月日时
//
// 精度为 day 时丢掉余下的时辰，为 hour 时继续按 1 时辰 10 天折算
func splitQiYun(seconds int, precision QiYunPrecision) qiYunDuration {
	if seconds < 0 {
		seconds = -seconds
	}
	minutes := seconds / 60

	var d qiYunDuration
	d.Year = minutes / minutesPerFortuneYear
	minutes %= minutesPerFortuneYear
	d.Month = minutes / minutesPerFortuneMonth
	minutes %= minutesPerFortuneMonth
	d.Day = minutes / minutesPerFortuneDay

	if precision == QiYunByHour {
		minutes %= minutesPerFortuneHour
		d.Hour = minutes * 2
	}
	return d
}

// addQiYun 把折算出的时长加到出生时刻上，得到交运时刻
//
// 逐步复现 tyme 的 AbstractChildLimitProvider.next：先按秒分时进位，
// 再逐月推进日期，月份天数按实际月份取
func addQiYun(birth tyme.SolarTime, d qiYunDuration) (tyme.SolarTime, error) {
	day := birth.GetDay() + d.Day
	hour := birth.GetHour() + d.Hour
	minute := birth.GetMinute() + d.Minute
	second := birth.GetSecond()

	minute += second / 60
	second %= 60
	hour += minute / 60
	minute %= 60
	day += hour / 24
	hour %= 24

	first, err := tyme.SolarMonth{}.FromYm(birth.GetYear()+d.Year, birth.GetMonth())
	if err != nil {
		return tyme.SolarTime{}, err
	}

	month := first.Next(d.Month)
	count := month.GetDayCount()
	for day > count {
		day -= count
		month = month.Next(1)
		count = month.GetDayCount()
	}

	t, err := tyme.SolarTime{}.FromYmdHms(month.GetYear(), month.GetMonth(), day, hour, minute, second)
	if err != nil {
		return tyme.SolarTime{}, err
	}
	return *t, nil
}

// qiYunText 拼出「出生后 0 年 10 月 12 天 4 时 起运」这样的说法
func qiYunText(d qiYunDuration, precision QiYunPrecision) string {
	text := fmt.Sprintf("出生后 %d 年 %d 月 %d 天", d.Year, d.Month, d.Day)
	if precision == QiYunByHour {
		text += fmt.Sprintf(" %d 时", d.Hour)
	}
	return text + " 起运"
}

// isForward 阳年男与阴年女顺排，阴年男与阳年女逆排
func isForward(yearPillar tyme.SixtyCycle, gender Gender) bool {
	yang := yearPillar.GetHeavenStem().GetYinYang() == tyme.YANG
	man := gender == GenderMale
	return yang == man
}

// tenStarsOf 一个干支的天干与地支十神
func tenStarsOf(dayStem tyme.HeavenStem, cycle tyme.SixtyCycle) (stemTenStar, branchTenStar string) {
	stemTenStar = TenStarOf(dayStem, cycle.GetHeavenStem())
	branchTenStar = BranchTenStarOf(dayStem, cycle.GetEarthBranch())
	return
}

// MinorFortuneOf 小运：从时柱起步，按虚岁逐年推一位
func MinorFortuneOf(hourPillar tyme.SixtyCycle, age int, forward bool) tyme.SixtyCycle {
	if forward {
		return hourPillar.Next(age)
	}
	return hourPillar.Next(-age)
}

// fortuneYearOf 组装一个流年
func fortuneYearOf(ctx FortuneContext, year, age int, forward bool) (FortuneYear, error) {
	sy, err := tyme.SixtyCycleYear{}.FromYear(year)
	if err != nil {
		return FortuneYear{}, err
	}

	cycle := sy.GetSixtyCycle()
	stemTenStar, branchTenStar := tenStarsOf(ctx.DayStem, cycle)
	return FortuneYear{
		Year:          year,
		Age:           age,
		SixtyCycle:    cycle.GetName(),
		StemTenStar:   stemTenStar,
		BranchTenStar: branchTenStar,
		MinorFortune:  MinorFortuneOf(ctx.HourPillar, age, forward).GetName(),
	}, nil
}

// BuildFortune 推起运与大运
func BuildFortune(ctx FortuneContext) (QiYun, []DecadeFortuneStep, error) {
	forward := isForward(ctx.YearPillar, ctx.Gender)

	// 折算所依据的节：顺排取下一个节，逆排取上一个节
	term := ctx.BirthTime.GetTerm()
	if !term.IsJie() {
		term = term.Next(-1)
	}
	if forward {
		term = term.Next(2)
	}

	duration := splitQiYun(
		term.GetJulianDay().GetSolarTime().Subtract(ctx.BirthTime),
		ctx.Precision,
	)

	startTime, err := addQiYun(ctx.BirthTime, duration)
	if err != nil {
		return QiYun{}, nil, err
	}

	birthYear := ctx.BirthTime.GetYear()
	startYear := startTime.GetYear()
	startAge := startYear - birthYear + 1

	qiYun := QiYun{
		Forward:     forward,
		YearCount:   duration.Year,
		MonthCount:  duration.Month,
		DayCount:    duration.Day,
		HourCount:   duration.Hour,
		MinuteCount: duration.Minute,
		StartTime:   FormatTime(startTime),
		StartAge:    startAge,
		Term:        termPointOf(term),
		Precision:   ctx.Precision,
		Text:        qiYunText(duration, ctx.Precision),
	}

	stepCount := (ctx.MaxAge - startAge + 1 + yearsPerDecade - 1) / yearsPerDecade
	if stepCount < 1 {
		stepCount = 1
	}

	decades := make([]DecadeFortuneStep, 0, stepCount)
	for i := 0; i < stepCount; i++ {
		// 大运干支从月柱起步，每步走一位
		step := i + 1
		if !forward {
			step = -step
		}
		cycle := ctx.MonthPillar.Next(step)

		stepStartAge := startAge + i*yearsPerDecade
		stepStartYear := startYear + i*yearsPerDecade

		years := make([]FortuneYear, 0, yearsPerDecade)
		for k := 0; k < yearsPerDecade; k++ {
			age := stepStartAge + k
			if age > ctx.MaxAge {
				break
			}
			var y FortuneYear
			y, err = fortuneYearOf(ctx, stepStartYear+k, age, forward)
			if err != nil {
				return QiYun{}, nil, err
			}
			years = append(years, y)
		}

		stemTenStar, branchTenStar := tenStarsOf(ctx.DayStem, cycle)
		decades = append(decades, DecadeFortuneStep{
			Index:         i,
			SixtyCycle:    cycle.GetName(),
			StemTenStar:   stemTenStar,
			BranchTenStar: branchTenStar,
			StartAge:      stepStartAge,
			EndAge:        stepStartAge + yearsPerDecade - 1,
			StartYear:     stepStartYear,
			EndYear:       stepStartYear + yearsPerDecade - 1,
			Years:         years,
		})
	}

	return qiYun, decades, nil
}

// BuildPreFortuneYears 起运之前的那几年，只有小运没有大运
//
// 虚岁从 1 数到起运虚岁的前一年
func BuildPreFortuneYears(ctx FortuneContext, startAge int, forward bool) ([]FortuneYear, error) {
	birthYear := ctx.BirthTime.GetYear()
	list := make([]FortuneYear, 0, startAge)
	for age := 1; age < startAge; age++ {
		y, err := fortuneYearOf(ctx, birthYear+age-1, age, forward)
		if err != nil {
			return nil, err
		}
		list = append(list, y)
	}
	return list, nil
}

// BuildFortuneMonths 某个干支年的十二个流月
//
// 以十二节为界，立春起为寅月，交节时刻取自寿星天文历
func BuildFortuneMonths(year int, dayStem tyme.HeavenStem) ([]FortuneMonth, error) {
	sy, err := tyme.SixtyCycleYear{}.FromYear(year)
	if err != nil {
		return nil, err
	}

	months := sy.GetMonths()
	out := make([]FortuneMonth, 0, len(months))
	for _, m := range months {
		cycle := m.GetSixtyCycle()
		term := tyme.SolarTerm{}.FromIndex(year, JieTermIndex(m.GetIndexInYear()))
		stemTenStar, branchTenStar := tenStarsOf(dayStem, cycle)
		out = append(out, FortuneMonth{
			TermName:      term.GetName(),
			TermTime:      FormatTime(term.GetJulianDay().GetSolarTime()),
			SixtyCycle:    cycle.GetName(),
			StemTenStar:   stemTenStar,
			BranchTenStar: branchTenStar,
		})
	}
	return out, nil
}

// FortunePosition 某个时刻在大运流年上的位置，解读时据此告诉模型「现在走到哪一步」
type FortunePosition struct {
	// Year 所处干支年的公历年份，立春前算前一年
	Year int
	// Age 虚岁
	Age int
	// SixtyCycle 所处流年的干支
	SixtyCycle string
	// NextSixtyCycle 下一个流年的干支
	NextSixtyCycle string
	// Decade 所处的大运，起运之前或超出 MaxAge 时为 nil
	Decade *DecadeFortuneStep
}

// FortuneAt 某个时刻落在哪个流年与大运上
//
// 流年以立春为界；虚岁与大运优先从大运表里取，表里没有这一年时虚岁按公历年份差算
func FortuneAt(chart Chart, now time.Time) (FortunePosition, error) {
	t, err := tyme.SolarTime{}.FromYmdHms(
		now.Year(),
		int(now.Month()),
		now.Day(),
		now.Hour(),
		now.Minute(),
		now.Second(),
	)
	if err != nil {
		return FortunePosition{}, err
	}
	year := SixtyCycleYearOf(*t)

	position := FortunePosition{Year: year, Age: year - chart.Input.Year + 1}
	if position.SixtyCycle, err = sixtyCycleNameOfYear(year); err != nil {
		return FortunePosition{}, err
	}
	if position.NextSixtyCycle, err = sixtyCycleNameOfYear(year + 1); err != nil {
		return FortunePosition{}, err
	}

	for i := range chart.Decades {
		decade := &chart.Decades[i]
		if year < decade.StartYear || year > decade.EndYear {
			continue
		}
		position.Decade = decade
		for _, y := range decade.Years {
			if y.Year == year {
				position.Age = y.Age
			}
		}
	}
	return position, nil
}

// sixtyCycleNameOfYear 某个公历年份对应的干支年名
func sixtyCycleNameOfYear(year int) (string, error) {
	sy, err := tyme.SixtyCycleYear{}.FromYear(year)
	if err != nil {
		return "", err
	}
	return sy.GetSixtyCycle().GetName(), nil
}
