package bazi

import "github.com/6tail/tyme4go/tyme"

// DefaultOptions 选项默认值
//
// 每一项都对应一处流派分歧，取值理由见 web/core/README.md
var DefaultOptions = Options{
	UseTrueSolarTime:      false,
	UseDaylightSaving:     false,
	LateZiAsNextDay:       false,
	QiYunPrecision:        QiYunByHour,
	ShenShaSkipBasePillar: false,
	MaxAge:                100,
	ElementStrategy:       "weighted",
}

// OptionsPatch 只覆盖给出的那几项选项
//
// 字段是指针，nil 表示调用方没给这一项，对应 TS 侧的 Partial<PaipanOptions>。
// HTTP 请求里省略的选项由此落回默认值，而不是被零值冲掉
type OptionsPatch struct {
	UseTrueSolarTime      *bool           `json:"useTrueSolarTime"`
	UseDaylightSaving     *bool           `json:"useDaylightSaving"`
	LateZiAsNextDay       *bool           `json:"lateZiAsNextDay"`
	QiYunPrecision        *QiYunPrecision `json:"qiYunPrecision"`
	ShenShaSkipBasePillar *bool           `json:"shenShaSkipBasePillar"`
	MaxAge                *int            `json:"maxAge"`
	ElementStrategy       *string         `json:"elementStrategy"`
}

// Apply 把给出的项覆盖到基准选项上
func (p OptionsPatch) Apply(base Options) Options {
	if p.UseTrueSolarTime != nil {
		base.UseTrueSolarTime = *p.UseTrueSolarTime
	}
	if p.UseDaylightSaving != nil {
		base.UseDaylightSaving = *p.UseDaylightSaving
	}
	if p.LateZiAsNextDay != nil {
		base.LateZiAsNextDay = *p.LateZiAsNextDay
	}
	if p.QiYunPrecision != nil {
		base.QiYunPrecision = *p.QiYunPrecision
	}
	if p.ShenShaSkipBasePillar != nil {
		base.ShenShaSkipBasePillar = *p.ShenShaSkipBasePillar
	}
	if p.MaxAge != nil {
		base.MaxAge = *p.MaxAge
	}
	if p.ElementStrategy != nil {
		base.ElementStrategy = *p.ElementStrategy
	}
	return base
}

// ResolveOptions 把补丁合到默认值上
func ResolveOptions(patch OptionsPatch) Options {
	return patch.Apply(DefaultOptions)
}

// Paipan 排盘
//
// 纯计算，不碰网络与磁盘，结果可直接序列化。与 TS 包 @kismet/core 的 paipan
// 逐字段一致，由 data/fixtures/charts.json 约束
func Paipan(input Input, options Options) (Chart, error) {
	corrected, err := CorrectTime(input, options)
	if err != nil {
		return Chart{}, err
	}

	four := BuildFourPillars(corrected.Effective, options.LateZiAsNextDay)
	dayStem := four.Day.GetHeavenStem()

	extras := four.Day.GetExtraEarthBranches()
	emptyBranches := make([]string, 0, len(extras))
	for _, b := range extras {
		emptyBranches = append(emptyBranches, b.GetName())
	}

	pillars := Pillars{
		Year:  BuildPillar(PillarYear, four.Year, dayStem, emptyBranches),
		Month: BuildPillar(PillarMonth, four.Month, dayStem, emptyBranches),
		Day:   BuildPillar(PillarDay, four.Day, dayStem, emptyBranches),
		Hour:  BuildPillar(PillarHour, four.Hour, dayStem, emptyBranches),
	}

	strategy, err := GetElementStrategy(options.ElementStrategy)
	if err != nil {
		return Chart{}, err
	}

	dayStemElement := dayStem.GetElement().GetName()
	elements := strategy.Evaluate(ScoringContext{
		Pillars:            pillars,
		DayStem:            dayStem.GetName(),
		DayStemElement:     dayStemElement,
		MonthBranch:        pillars.Month.Branch,
		MonthBranchElement: pillars.Month.BranchElement,
	})

	fortuneCtx := FortuneContext{
		BirthTime:   corrected.Effective,
		Gender:      input.Gender,
		YearPillar:  four.Year,
		MonthPillar: four.Month,
		HourPillar:  four.Hour,
		DayStem:     dayStem,
		Precision:   options.QiYunPrecision,
		MaxAge:      options.MaxAge,
	}
	qiYun, decades, err := BuildFortune(fortuneCtx)
	if err != nil {
		return Chart{}, err
	}

	months, err := BuildFortuneMonths(SixtyCycleYearOf(corrected.Effective), dayStem)
	if err != nil {
		return Chart{}, err
	}

	// 胎元、胎息、命宫、身宫都只依赖四柱，直接从本派四柱构造
	eightChar := tyme.EightChar{}.FromSixtyCycle(four.Year, four.Month, four.Day, four.Hour)

	timeInfo := corrected.Info
	timeInfo.Zodiac = four.Year.GetEarthBranch().GetZodiac().GetName()

	var location *Location
	if input.Location != "" || input.Longitude != nil || input.Latitude != nil {
		location = &Location{
			Name:      input.Location,
			Longitude: input.Longitude,
			Latitude:  input.Latitude,
		}
	}

	return Chart{
		Name:           input.Name,
		Gender:         input.Gender,
		Input:          input,
		Options:        options,
		Location:       location,
		Time:           timeInfo,
		Pillars:        pillars,
		DayStem:        dayStem.GetName(),
		DayStemElement: dayStemElement,
		EmptyBranches:  emptyBranches,
		Elements:       elements,
		ShenSha:        MatchShenSha(pillars, options.ShenShaSkipBasePillar),
		QiYun:          qiYun,
		Decades:        decades,
		Months:         months,
		Extras: Extras{
			FetalOrigin: eightChar.GetFetalOrigin().GetName(),
			FetalBreath: eightChar.GetFetalBreath().GetName(),
			OwnSign:     eightChar.GetOwnSign().GetName(),
			BodySign:    eightChar.GetBodySign().GetName(),
		},
	}, nil
}

// MonthsOfYear 取任意一个干支年的流月
func MonthsOfYear(chart Chart, year int) ([]FortuneMonth, error) {
	stem, err := tyme.HeavenStem{}.FromName(chart.DayStem)
	if err != nil {
		return nil, err
	}
	return BuildFortuneMonths(year, *stem)
}
