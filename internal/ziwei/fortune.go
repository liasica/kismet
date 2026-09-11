package ziwei

import (
	"fmt"
	"time"

	"github.com/6tail/tyme4go/tyme"
)

// twelveByBranch 十二神按地支排列：起点宫放第一位，顺者顺行、逆者逆行
func twelveByBranch(names []string, start int, forward bool) []string {
	out := make([]string, 12)
	for i, name := range names {
		step := i
		if !forward {
			step = -i
		}
		out[mod(start+step, 12)] = name
	}
	return out
}

// changShengOf 长生十二神，起点按五行局
func changShengOf(bureau int, forward bool) []string {
	return twelveByBranch(changSheng, changShengStart[bureau], forward)
}

// boShiOf 博士十二神，从禄存起
func boShiOf(lu int, forward bool) []string {
	return twelveByBranch(boShi, lu, forward)
}

// suiQianOf 岁前十二神，从流年太岁起顺行
func suiQianOf(yearBranch int) []string {
	return twelveByBranch(suiQian, yearBranch, true)
}

// jiangQianOf 将前十二神，从流年三合局的旺地起顺行
func jiangQianOf(yearBranch int) []string {
	return twelveByBranch(jiangQian, generalStart[yearBranch%4], true)
}

// decadesOf 大限按地支排列，起限岁数即局数，每宫十年
func decadesOf(lifePalace int, forward bool, bureau, birthYear int) []Decade {
	out := make([]Decade, 12)
	for i := 0; i < 12; i++ {
		step := i
		if !forward {
			step = -i
		}
		startAge := bureau + 10*i
		out[mod(lifePalace+step, 12)] = Decade{
			Index:     i,
			StartAge:  startAge,
			EndAge:    startAge + 9,
			StartYear: birthYear + startAge - 1,
			EndYear:   birthYear + startAge + 8,
		}
	}
	return out
}

// minorLimitBranchOf 某个虚岁的小限所在宫：一岁起于年支三合局墓库之冲，男顺女逆
func minorLimitBranchOf(yearBranch int, male bool, age int) int {
	step := 1 - age
	if male {
		step = age - 1
	}
	return mod(minorLimitStart[yearBranch%4]+step, 12)
}

// minorLimitAgesOf 小限落在各宫的虚岁，按地支排列；每宫都是非 nil 切片，序列化成 []
func minorLimitAgesOf(yearBranch int, male bool, maxAge int) [][]int {
	out := make([][]int, 12)
	for i := range out {
		out[i] = make([]int, 0)
	}
	for age := 1; age <= maxAge; age++ {
		at := minorLimitBranchOf(yearBranch, male, age)
		out[at] = append(out[at], age)
	}
	return out
}

// mutationsOf 某个天干的四化，按禄权科忌
func mutationsOf(stem int) []Mutation {
	out := make([]Mutation, 0, 4)
	for i, star := range mutationTable[stem] {
		out = append(out, Mutation{Star: star, Mutation: mutationNames[i]})
	}
	return out
}

// flowSeed 一颗流曜的名字与未取模的位置
type flowSeed struct {
	name string
	at   int
}

// flowOf 大限或流年的流曜：流禄羊陀、流魁钺、流昌曲与流四化按干起，流马按支起，流年另有年解
func flowOf(scope string, stem, branch, lifePalace int) Flow {
	lu := luCun[stem]
	seeds := []flowSeed{
		{"流禄", lu}, {"流羊", lu + 1}, {"流陀", lu - 1},
		{"流魁", tianKui[stem]}, {"流钺", tianYue[stem]},
		{"流昌", liuChang[stem]}, {"流曲", liuQu[stem]},
		{"流马", tianMa[branch%4]},
	}
	if scope == "year" {
		seeds = append(seeds, flowSeed{"年解", 10 - branch})
	}

	stars := make([]FlowStar, 0, len(seeds))
	for _, seed := range seeds {
		stars = append(stars, FlowStar{Name: seed.name, Branch: earthBranches[mod(seed.at, 12)]})
	}
	return Flow{
		Scope:      scope,
		Stem:       heavenStems[stem],
		Branch:     earthBranches[branch],
		SixtyCycle: heavenStems[stem] + earthBranches[branch],
		LifePalace: earthBranches[lifePalace],
		Stars:      stars,
		Mutations:  mutationsOf(stem),
	}
}

// lunarYearCycle 农历年的干支索引
func lunarYearCycle(year int) (stem, branch int, err error) {
	lunarYear, err := tyme.LunarYear{}.FromYear(year)
	if err != nil {
		return
	}
	name := []rune(lunarYear.GetSixtyCycle().GetName())
	stem, branch = stemIndex(string(name[0])), BranchIndex(string(name[1]))
	return
}

// DecadeFlow 第 index 步大限的流曜，按大限宫的干支起
func DecadeFlow(chart Chart, index int) (Flow, error) {
	for _, palace := range chart.Palaces {
		if palace.Decade.Index == index {
			branch := BranchIndex(palace.Branch)
			return flowOf("decade", stemIndex(palace.Stem), branch, branch), nil
		}
	}
	return Flow{}, fmt.Errorf("大限序号应在 0 到 11 之间，收到 %d", index)
}

// Yearly 某个农历年的流年
func Yearly(chart Chart, year int) (Year, error) {
	stem, branch, err := lunarYearCycle(year)
	if err != nil {
		return Year{}, err
	}

	age := year - chart.Lunar.Year + 1
	male := chart.Gender == "male"
	// 斗君：太岁宫起正月逆数至生月，再从该宫起子时顺数至生时
	douJun := mod(branch-(chart.Lunar.EffectiveMonth-1)+BranchIndex(chart.Lunar.HourBranch), 12)

	return Year{
		Flow:       flowOf("year", stem, branch, branch),
		Year:       year,
		Age:        age,
		SuiQian:    suiQianOf(branch),
		JiangQian:  jiangQianOf(branch),
		DouJun:     earthBranches[douJun],
		MinorLimit: earthBranches[minorLimitBranchOf(BranchIndex(chart.YearBranch), male, age)],
	}, nil
}

// LimitAt 某个时刻所处的运限，虚岁与流年都以农历年为界，起限之前没有大限
func LimitAt(chart Chart, now time.Time) (Limit, error) {
	solarDay, err := tyme.SolarDay{}.FromYmd(now.Year(), int(now.Month()), now.Day())
	if err != nil {
		return Limit{}, err
	}
	lunarYear := solarDay.GetLunarDay().GetLunarMonth().GetLunarYear().GetYear()

	var yearly Year
	if yearly, err = Yearly(chart, lunarYear); err != nil {
		return Limit{}, err
	}

	limit := Limit{LunarYear: lunarYear, Age: yearly.Age, Yearly: yearly}
	for _, palace := range chart.Palaces {
		if palace.Decade.StartAge <= yearly.Age && yearly.Age <= palace.Decade.EndAge {
			decade := palace.Decade
			limit.Decade = &decade
			break
		}
	}
	return limit, nil
}
