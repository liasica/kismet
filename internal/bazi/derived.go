package bazi

import "github.com/6tail/tyme4go/tyme"

import "slices"

// hideStemTypes tyme 的藏干层次枚举到本模块类型的映射，下标即枚举值
var hideStemTypes = [...]HideStemType{
	tyme.RESIDUAL: HideStemResidual,
	tyme.MIDDLE:   HideStemMiddle,
	tyme.MAIN:     HideStemMain,
}

// TenStarOf 某个天干对日主的十神
func TenStarOf(dayStem tyme.HeavenStem, target tyme.HeavenStem) string {
	return dayStem.GetTenStar(target).GetName()
}

// HideStemsOf 地支的藏干，按本气、中气、余气排列
func HideStemsOf(dayStem tyme.HeavenStem, branch tyme.EarthBranch) []HideStem {
	hides := branch.GetHideHeavenStems()
	out := make([]HideStem, 0, len(hides))
	for _, h := range hides {
		stem := h.GetHeavenStem()
		out = append(out, HideStem{
			Stem:    stem.GetName(),
			Type:    hideStemTypes[h.GetType()],
			TenStar: TenStarOf(dayStem, stem),
			Element: stem.GetElement().GetName(),
		})
	}
	return out
}

// BranchTenStarOf 地支本气藏干对日主的十神，大运流年格里的地支十神取这一位
func BranchTenStarOf(dayStem tyme.HeavenStem, branch tyme.EarthBranch) string {
	return TenStarOf(dayStem, branch.GetHideHeavenStemMain())
}

// BuildPillar 组装一柱
//
// emptyBranches 是日柱旬空的两个地支，用于标注本柱地支是否落空
func BuildPillar(
	kind PillarKind,
	cycle tyme.SixtyCycle,
	dayStem tyme.HeavenStem,
	emptyBranches []string,
) Pillar {
	stem := cycle.GetHeavenStem()
	branch := cycle.GetEarthBranch()

	extras := cycle.GetExtraEarthBranches()
	extraNames := make([]string, 0, len(extras))
	for _, b := range extras {
		extraNames = append(extraNames, b.GetName())
	}

	stemTenStar := "日主"
	if kind != PillarDay {
		stemTenStar = TenStarOf(dayStem, stem)
	}

	return Pillar{
		Kind:          kind,
		SixtyCycle:    cycle.GetName(),
		Stem:          stem.GetName(),
		Branch:        branch.GetName(),
		StemElement:   stem.GetElement().GetName(),
		BranchElement: branch.GetElement().GetName(),
		StemTenStar:   stemTenStar,
		HideStems:     HideStemsOf(dayStem, branch),
		Sound:         cycle.GetSound().GetName(),
		Terrain:       dayStem.GetTerrain(branch).GetName(),
		SelfTerrain:   stem.GetTerrain(branch).GetName(),
		Ten:           cycle.GetTen().GetName(),
		ExtraBranches: extraNames,
		Empty:         slices.Contains(emptyBranches, branch.GetName()),
	}
}

// PillarOf 按柱取值
func PillarOf(pillars Pillars, kind PillarKind) Pillar {
	switch kind {
	case PillarYear:
		return pillars.Year
	case PillarMonth:
		return pillars.Month
	case PillarDay:
		return pillars.Day
	case PillarHour:
		return pillars.Hour
	}
	return Pillar{}
}
