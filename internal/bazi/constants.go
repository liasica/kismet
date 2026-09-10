package bazi

import "github.com/6tail/tyme4go/tyme"

// PillarKinds 四柱的固定顺序
var PillarKinds = []PillarKind{PillarYear, PillarMonth, PillarDay, PillarHour}

// pillarLabels 柱名，键是英文枚举，中文只在值里
var pillarLabels = map[PillarKind]string{
	PillarYear:  "年柱",
	PillarMonth: "月柱",
	PillarDay:   "日柱",
	PillarHour:  "时柱",
}

// PillarLabel 柱的中文名
func PillarLabel(kind PillarKind) string {
	return pillarLabels[kind]
}

// tenStarShorts 十神简称，下标与 tyme.TenStarNames 对齐，大运流年格里用简称省地方
var tenStarShorts = [...]string{"比", "劫", "食", "伤", "才", "财", "杀", "官", "枭", "印"}

// ShortTenStar 十神的简称，认不出的原样返回
func ShortTenStar(name string) string {
	for i, full := range tyme.TenStarNames {
		if full == name {
			return tenStarShorts[i]
		}
	}
	return name
}

// elementKeys 五行的序列化键，下标与 tyme.ElementNames 对齐
var elementKeys = [...]string{"wood", "fire", "earth", "metal", "water"}

// ElementKey 五行的序列化键
func ElementKey(element string) string {
	for i, name := range tyme.ElementNames {
		if name == element {
			return elementKeys[i]
		}
	}
	return ""
}

// hideStemLabels 藏干层次的中文名
var hideStemLabels = map[HideStemType]string{
	HideStemMain:     "本气",
	HideStemMiddle:   "中气",
	HideStemResidual: "余气",
}

// HideStemLabel 藏干层次的中文名
func HideStemLabel(t HideStemType) string {
	return hideStemLabels[t]
}

// 寅在十二支里的序号，立春起为寅月，月序由此偏移得出
const tigerBranchIndex = 2

// MonthIndexFromTiger 地支对应的月序，寅月为 0
func MonthIndexFromTiger(branch tyme.EarthBranch) int {
	return (branch.GetIndex() - tigerBranchIndex + 12) % 12
}

// 立春在 tyme.SolarTermNames 里的序号，之后每两个序号进一节
const liChunTermIndex = 3

// TwelveJieCount 十二节
const TwelveJieCount = 12

// JieTermIndex 第 n 个节在节气表里的序号，n 从 0 起对应立春
func JieTermIndex(n int) int {
	return liChunTermIndex + n*2
}
