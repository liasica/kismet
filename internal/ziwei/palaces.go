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
