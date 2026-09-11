package ziwei

// lifePalaceOf 寅宫起正月顺数至生月，再从该宫起子时逆数至生时
func lifePalaceOf(month, hour int) int {
	return mod(2+(month-1)-hour, 12)
}

// bodyPalaceOf 生月所到之宫起子时顺数至生时
func bodyPalaceOf(month, hour int) int {
	return mod(2+(month-1)+hour, 12)
}

// palaceStemOf 五虎遁：由年干定寅宫天干，其余宫顺推，子丑两宫接在亥之后
func palaceStemOf(yearStem, branch int) int {
	yinStem := (yearStem%5)*2 + 2
	return (yinStem + mod(branch-2, 12)) % 10
}

// nayinElementOf 干支的纳音五行
func nayinElementOf(stem, branch int) string {
	return nayinElements[stem/2][(branch%6)/2]
}

// bureauOf 命宫干支的纳音定五行局
func bureauOf(stem, branch int) Bureau {
	element := nayinElementOf(stem, branch)
	number := bureauNumber[element]
	return Bureau{Name: bureauName[number], Element: element, Number: number}
}

// PalaceBranch 十二宫之一：宫名与其地支
type PalaceBranch struct {
	Name   string
	Branch string
}

// PalaceLayout 十二宫自命宫逆布的完整分布：给定命宫所在地支，按命宫、兄弟宫……父母宫的
// 顺序给出每一宫对应的地支。原局、大限、流年的命宫各自另起一套十二宫，方向都是逆布，
// 调用方在大限、流年命宫另立时可直接查表得到其余十一宫的位置，不必自己推算
func PalaceLayout(lifePalaceBranch string) []PalaceBranch {
	start := branchIndex(lifePalaceBranch)
	layout := make([]PalaceBranch, len(palaceNames))
	for i, name := range palaceNames {
		layout[i] = PalaceBranch{Name: name, Branch: earthBranches[mod(start-i, 12)]}
	}
	return layout
}
