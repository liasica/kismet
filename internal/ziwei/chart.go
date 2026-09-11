package ziwei

import (
	"github.com/6tail/tyme4go/tyme"

	"github.com/liasica/kismet/internal/birth"
)

// starsAt 落在某宫的星，按清单顺序，带庙陷与生年四化；总是返回非 nil 切片
func starsAt(names []string, positions map[string]int, branch int, mutations []Mutation) []Star {
	out := make([]Star, 0)
	for _, name := range names {
		if positions[name] != branch {
			continue
		}
		star := Star{Name: name, Brightness: BrightnessOf(name, branch)}
		for _, m := range mutations {
			if m.Star == name {
				star.Mutation = m.Mutation
			}
		}
		out = append(out, star)
	}
	return out
}

// Paipan 排盘
//
// 纯计算，不碰网络与磁盘，结果可直接序列化。与 TS 包 @kismet/core 的 ziweiPaipan
// 逐字段一致，由 data/fixtures/ziwei-charts.json 约束
func Paipan(input birth.Input, options Options) (Chart, error) {
	corrected, err := birth.CorrectTime(input, options.UseTrueSolarTime, options.UseDaylightSaving)
	if err != nil {
		return Chart{}, err
	}
	lunar := lunarBirthOf(corrected.Effective, options.LateZiAsNextDay)

	cycle := []rune(lunar.yearSixtyCycle)
	yearStem := stemIndex(string(cycle[0]))
	yearBranch := branchIndex(string(cycle[1]))
	yang := yearStem%2 == 0
	male := input.Gender == birth.GenderMale
	// 阳男阴女顺行
	forward := yang == male

	lifePalace := lifePalaceOf(lunar.effectiveMonth, lunar.hourBranch)
	bodyPalace := bodyPalaceOf(lunar.effectiveMonth, lunar.hourBranch)
	bureau := bureauOf(palaceStemOf(yearStem, lifePalace), lifePalace)

	positions := placeStars(starContext{
		yearStem:   yearStem,
		yearBranch: yearBranch,
		month:      lunar.effectiveMonth,
		day:        lunar.day,
		hour:       lunar.hourBranch,
		lifePalace: lifePalace,
		bodyPalace: bodyPalace,
		forward:    forward,
		yang:       yang,
		bureau:     bureau.Number,
	})
	mutations := mutationsOf(yearStem)
	changShengNames := changShengOf(bureau.Number, forward)
	boShiNames := boShiOf(positions.minor["禄存"], forward)
	decades := decadesOf(lifePalace, forward, bureau.Number, lunar.year)
	minorLimits := minorLimitAgesOf(yearBranch, male, options.MaxAge)

	palaces := make([]Palace, 0, 12)
	for b, branch := range earthBranches {
		index := mod(lifePalace-b, 12)
		stem := heavenStems[palaceStemOf(yearStem, b)]
		palaces = append(palaces, Palace{
			Index:          index,
			Name:           palaceNames[index],
			Branch:         branch,
			Stem:           stem,
			SixtyCycle:     stem + branch,
			IsBodyPalace:   b == bodyPalace,
			MajorStars:     starsAt(majorStars, positions.major, b, mutations),
			MinorStars:     starsAt(minorStars, positions.minor, b, mutations),
			AdjectiveStars: starsAt(adjectiveStars, positions.adjective, b, mutations),
			ChangSheng:     changShengNames[b],
			BoShi:          boShiNames[b],
			Decade:         decades[b],
			MinorLimitAges: minorLimits[b],
		})
	}

	// 生肖按农历年支，与八字按立春分界不同
	yearBranchName, err := tyme.EarthBranch{}.FromName(earthBranches[yearBranch])
	if err != nil {
		return Chart{}, err
	}
	timeInfo := corrected.Info
	timeInfo.Zodiac = yearBranchName.GetZodiac().GetName()

	return Chart{
		Name:     input.Name,
		Gender:   input.Gender,
		Input:    input,
		Options:  options,
		Location: birth.LocationOf(input),
		Time:     timeInfo,
		Lunar: Lunar{
			Year:           lunar.year,
			YearSixtyCycle: lunar.yearSixtyCycle,
			Month:          lunar.month,
			Leap:           lunar.leap,
			Day:            lunar.day,
			EffectiveMonth: lunar.effectiveMonth,
			HourBranch:     earthBranches[lunar.hourBranch],
			Text:           lunar.text,
		},
		YearStem:   heavenStems[yearStem],
		YearBranch: earthBranches[yearBranch],
		Yang:       yang,
		Forward:    forward,
		LifePalace: earthBranches[lifePalace],
		BodyPalace: earthBranches[bodyPalace],
		Bureau:     bureau,
		LifeMaster: lifeMaster[yearBranch],
		BodyMaster: bodyMaster[yearBranch],
		Mutations:  mutations,
		Palaces:    palaces,
	}, nil
}
