package bazi

import (
	"fmt"
	"math"
	"slices"

	"github.com/6tail/tyme4go/tyme"
)

// 五行强弱评分
//
// 评分规则各家不同，这里把规则收在可替换的策略里，Options.ElementStrategy
// 选哪个策略就用哪套权重，新增流派只需再注册一个策略，不改调用方

// ScoringContext 评分所需的上下文
type ScoringContext struct {
	Pillars Pillars
	DayStem string
	// DayStemElement 日主五行
	DayStemElement string
	// MonthBranch 月令地支
	MonthBranch string
	// MonthBranchElement 月令五行
	MonthBranchElement string
}

// ElementStrategy 五行评分策略
type ElementStrategy interface {
	Name() string
	Description() string
	Evaluate(ctx ScoringContext) ElementReport
}

// WeightConfig 加权计分的权重配置
type WeightConfig struct {
	// Stem 天干
	Stem float64
	// HideMain 地支本气藏干
	HideMain float64
	// HideMiddle 地支中气藏干
	HideMiddle float64
	// HideResidual 地支余气藏干
	HideResidual float64
	// MonthCommandMultiplier 月令地支及其藏干的加权倍数
	MonthCommandMultiplier float64
}

// DefaultWeights 默认权重
var DefaultWeights = WeightConfig{
	Stem:                   1,
	HideMain:               1,
	HideMiddle:             0.5,
	HideResidual:           0.3,
	MonthCommandMultiplier: 1.5,
}

// elementIndex 五行在 tyme.ElementNames 里的序号，木 0 火 1 土 2 金 3 水 4
func elementIndex(name string) int {
	return slices.Index(tyme.ElementNames, name)
}

// round2 保留两位小数，避免浮点尾数进到结果里
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// seasonalStates 月令主导的旺相休囚死
//
// 以月令所属五行为「旺」，其所生为「相」，生它的为「休」，克它的为「囚」，它所克的为「死」
func seasonalStates(monthElement string) SeasonalState {
	m, err := tyme.Element{}.FromName(monthElement)
	if err != nil {
		return SeasonalState{}
	}

	var states [5]string
	states[elementIndex(m.GetName())] = "旺"
	states[elementIndex(m.GetReinforce().GetName())] = "相"
	states[elementIndex(m.GetReinforced().GetName())] = "休"
	states[elementIndex(m.GetRestrained().GetName())] = "囚"
	states[elementIndex(m.GetRestrain().GetName())] = "死"

	return SeasonalState{
		Wood:  states[0],
		Fire:  states[1],
		Earth: states[2],
		Metal: states[3],
		Water: states[4],
	}
}

// strengthOf 日主旺衰倾向
//
// 以同类占比分五档，分界线本身也是流派问题，跟着策略一起走
func strengthOf(support, total float64) string {
	if total <= 0 {
		return "中和"
	}
	ratio := support / total
	switch {
	case ratio >= 0.6:
		return "旺"
	case ratio >= 0.5:
		return "偏旺"
	case ratio >= 0.4:
		return "中和"
	case ratio >= 0.3:
		return "偏弱"
	default:
		return "弱"
	}
}

// weightedStrategy 按权重配置计分的策略
type weightedStrategy struct {
	name        string
	description string
	weights     WeightConfig
}

// NewWeightedStrategy 按权重配置生成一个策略
func NewWeightedStrategy(name, description string, weights WeightConfig) ElementStrategy {
	return weightedStrategy{name: name, description: description, weights: weights}
}

func (s weightedStrategy) Name() string {
	return s.name
}

func (s weightedStrategy) Description() string {
	return s.description
}

// hideWeightOf 取某个藏干层次的基础权重
func (s weightedStrategy) hideWeightOf(t HideStemType) float64 {
	switch t {
	case HideStemMain:
		return s.weights.HideMain
	case HideStemMiddle:
		return s.weights.HideMiddle
	default:
		return s.weights.HideResidual
	}
}

func (s weightedStrategy) Evaluate(ctx ScoringContext) ElementReport {
	var scores [5]float64
	contributions := make([]ElementContribution, 0, 16)

	add := func(element string, weight float64, source, reason string) {
		scores[elementIndex(element)] += weight
		contributions = append(contributions, ElementContribution{
			Source:  source,
			Element: element,
			Weight:  round2(weight),
			Reason:  reason,
		})
	}

	for _, kind := range PillarKinds {
		pillar := PillarOf(ctx.Pillars, kind)
		label := PillarLabel(kind)

		// 月令地支及其藏干加权，其余柱按基础权重
		multiplier := 1.0
		if kind == PillarMonth {
			multiplier = s.weights.MonthCommandMultiplier
		}

		add(
			pillar.StemElement,
			s.weights.Stem,
			label+"天干"+pillar.Stem,
			"天干本身",
		)

		for _, hide := range pillar.HideStems {
			reason := "地支" + HideStemLabel(hide.Type)
			if kind == PillarMonth {
				reason = fmt.Sprintf("月令%s，加权 %v 倍", HideStemLabel(hide.Type), multiplier)
			}
			add(
				hide.Element,
				s.hideWeightOf(hide.Type)*multiplier,
				label+pillar.Branch+"藏"+hide.Stem,
				reason,
			)
		}
	}

	total := 0.0
	for i := range scores {
		scores[i] = round2(scores[i])
		total += scores[i]
	}
	total = round2(total)

	// 同类为与日主同五行的比劫，加生日主的印星
	supportScore := 0.0
	self, err := tyme.Element{}.FromName(ctx.DayStemElement)
	if err == nil {
		supportScore = round2(
			scores[elementIndex(self.GetName())] +
				scores[elementIndex(self.GetReinforced().GetName())],
		)
	}

	return ElementReport{
		Strategy: s.name,
		Scores: ElementScores{
			Wood:  scores[0],
			Fire:  scores[1],
			Earth: scores[2],
			Metal: scores[3],
			Water: scores[4],
		},
		Total:         total,
		SupportScore:  supportScore,
		OpposeScore:   round2(total - supportScore),
		Strength:      strengthOf(supportScore, total),
		SeasonalState: seasonalStates(ctx.MonthBranchElement),
		Contributions: contributions,
	}
}

// WeightedStrategy 默认策略
var WeightedStrategy = NewWeightedStrategy(
	"weighted",
	"天干 1、本气 1、中气 0.5、余气 0.3，月令部分再乘 1.5",
	DefaultWeights,
)

// CountStrategy 只数干支个数的朴素策略
//
// 用来对照加权策略，也证明策略确实可替换
var CountStrategy = NewWeightedStrategy(
	"count",
	"天干与地支本气各记 1 分，不计中气余气，月令不加权",
	WeightConfig{Stem: 1, HideMain: 1, MonthCommandMultiplier: 1},
)

// elementStrategies 已注册的策略，顺序与 TS 侧一致
var elementStrategies = []ElementStrategy{WeightedStrategy, CountStrategy}

// ElementStrategies 已注册的全部策略
func ElementStrategies() []ElementStrategy {
	return slices.Clone(elementStrategies)
}

// GetElementStrategy 按名字取策略
func GetElementStrategy(name string) (ElementStrategy, error) {
	for _, s := range elementStrategies {
		if s.Name() == name {
			return s, nil
		}
	}

	known := make([]string, 0, len(elementStrategies))
	for _, s := range elementStrategies {
		known = append(known, s.Name())
	}
	return nil, fmt.Errorf("未注册的五行评分策略 %s，已注册的有 %v", name, known)
}

// ElementOfStem 天干的五行
func ElementOfStem(stem string) string {
	s, err := tyme.HeavenStem{}.FromName(stem)
	if err != nil {
		return ""
	}
	return s.GetElement().GetName()
}
