package bazi

import (
	"slices"

	"github.com/6tail/tyme4go/tyme"
)

// ShenShaBase 神煞查法的基准位
type ShenShaBase string

const (
	// ShenShaByYearStem 以年干查
	ShenShaByYearStem ShenShaBase = "yearStem"
	// ShenShaByYearBranch 以年支查
	ShenShaByYearBranch ShenShaBase = "yearBranch"
	// ShenShaByMonthBranch 以月支查
	ShenShaByMonthBranch ShenShaBase = "monthBranch"
	// ShenShaByDayStem 以日干查
	ShenShaByDayStem ShenShaBase = "dayStem"
	// ShenShaByDayBranch 以日支查
	ShenShaByDayBranch ShenShaBase = "dayBranch"
	// ShenShaByDayPillar 以日柱干支整体判定
	ShenShaByDayPillar ShenShaBase = "dayPillar"
)

// ShenShaTarget 在目标柱的哪个部位匹配
type ShenShaTarget string

const (
	ShenShaTargetStem       ShenShaTarget = "stem"
	ShenShaTargetBranch     ShenShaTarget = "branch"
	ShenShaTargetSixtyCycle ShenShaTarget = "sixtyCycle"
)

// ShenShaRule 一条神煞的查法
//
// 查法写成表数据加声明式规则，匹配由 MatchShenSha 一个函数完成，不为单条神煞写分支
type ShenShaRule struct {
	Name   string
	Base   ShenShaBase
	Target ShenShaTarget
	// Table 基准值的序号到命中值的映射
	//
	// 以干为基准时下标是十干序号，以支为基准时下标是十二支序号；
	// 以日柱整体判定的规则只用下标 0。用下标而不用干支字做键，
	// 是为了避开中文 map key，同时省掉一次字符串查找
	Table [][]string
	// Scope 限定可以落在哪些柱，为空表示四柱都查
	Scope []PillarKind
	// Note 查法出处与流派说明
	Note string
}

// shenShaBaseLabels 基准位在结果里的中文说法
var shenShaBaseLabels = map[ShenShaBase]string{
	ShenShaByYearStem:    "年干",
	ShenShaByYearBranch:  "年支",
	ShenShaByMonthBranch: "月支",
	ShenShaByDayStem:     "日干",
	ShenShaByDayBranch:   "日支",
	ShenShaByDayPillar:   "日柱",
}

// shenShaBasePillars 一条规则的基准位落在哪一柱
var shenShaBasePillars = map[ShenShaBase]PillarKind{
	ShenShaByYearStem:    PillarYear,
	ShenShaByYearBranch:  PillarYear,
	ShenShaByMonthBranch: PillarMonth,
	ShenShaByDayStem:     PillarDay,
	ShenShaByDayBranch:   PillarDay,
	ShenShaByDayPillar:   PillarDay,
}

// baseValueOf 取一条规则的基准值与它在表里的下标
//
// 以日柱整体判定时下标恒为 0，基准值是日柱干支
func baseValueOf(base ShenShaBase, pillars Pillars) (value string, index int) {
	switch base {
	case ShenShaByYearStem:
		value = pillars.Year.Stem
		index = stemIndexOf(value)
	case ShenShaByYearBranch:
		value = pillars.Year.Branch
		index = branchIndexOf(value)
	case ShenShaByMonthBranch:
		value = pillars.Month.Branch
		index = branchIndexOf(value)
	case ShenShaByDayStem:
		value = pillars.Day.Stem
		index = stemIndexOf(value)
	case ShenShaByDayBranch:
		value = pillars.Day.Branch
		index = branchIndexOf(value)
	case ShenShaByDayPillar:
		value = pillars.Day.SixtyCycle
		index = 0
	}
	return
}

func stemIndexOf(name string) int {
	return slices.Index(tyme.HeavenStemNames, name)
}

func branchIndexOf(name string) int {
	return slices.Index(tyme.EarthBranchNames, name)
}

// targetValueOf 取一柱上被比对的那个值
func targetValueOf(target ShenShaTarget, pillar Pillar) string {
	switch target {
	case ShenShaTargetStem:
		return pillar.Stem
	case ShenShaTargetBranch:
		return pillar.Branch
	case ShenShaTargetSixtyCycle:
		return pillar.SixtyCycle
	}
	return ""
}

// MatchShenSha 按规则表匹配神煞
//
// skipBasePillar 为 true 时基准柱自身不再标注该神煞，问真八字用这个口径：
// 将星以年支查，年支午自身即是将星，它只在时柱标将星。以日柱整体判定的规则
// 不受此项影响，那类规则的基准与目标本就是同一柱
func MatchShenSha(pillars Pillars, skipBasePillar bool) []ShenShaHit {
	hits := make([]ShenShaHit, 0, 8)

	for _, rule := range ShenShaRules {
		baseValue, baseIndex := baseValueOf(rule.Base, pillars)
		if baseIndex < 0 || baseIndex >= len(rule.Table) {
			continue
		}
		wanted := rule.Table[baseIndex]
		if len(wanted) == 0 {
			continue
		}

		scope := rule.Scope
		if len(scope) == 0 {
			scope = PillarKinds
		}

		for _, kind := range scope {
			if skipBasePillar &&
				rule.Base != ShenShaByDayPillar &&
				kind == shenShaBasePillars[rule.Base] {
				continue
			}

			pillar := PillarOf(pillars, kind)
			value := targetValueOf(rule.Target, pillar)
			if !slices.Contains(wanted, value) {
				continue
			}

			hits = append(hits, ShenShaHit{
				Name:    rule.Name,
				Pillar:  kind,
				Matched: value,
				By:      shenShaBaseLabels[rule.Base] + baseValue,
				Note:    rule.Note,
			})
		}
	}

	return hits
}

// GroupShenShaByPillar 把命中结果按柱归拢
func GroupShenShaByPillar(hits []ShenShaHit) map[PillarKind][]ShenShaHit {
	grouped := make(map[PillarKind][]ShenShaHit, len(PillarKinds))
	for _, kind := range PillarKinds {
		grouped[kind] = nil
	}
	for _, h := range hits {
		grouped[h.Pillar] = append(grouped[h.Pillar], h)
	}
	return grouped
}
