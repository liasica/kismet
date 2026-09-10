/**
 * 五行强弱评分
 *
 * 评分规则各家不同，这里把规则收在可替换的策略里，`PaipanOptions.elementStrategy`
 * 选哪个策略就用哪套权重，新增流派只需再注册一个策略，不改调用方
 */

import { Element, HeavenStem } from "tyme4ts"

import {
  ELEMENT_KEY_ORDER,
  ELEMENT_KEYS,
  ELEMENT_NAMES,
  PILLAR_KINDS,
  PILLAR_LABELS,
} from "./data/constants"
import type {
  ElementContribution,
  ElementKey,
  ElementReport,
  FiveElement,
  Pillar,
  PillarKind,
} from "./types"

export interface ScoringContext {
  pillars: Record<PillarKind, Pillar>
  dayStem: string
  dayStemElement: FiveElement
  /** 月令地支 */
  monthBranch: string
  monthBranchElement: FiveElement
}

export interface ElementStrategy {
  readonly name: string
  readonly description: string
  evaluate(ctx: ScoringContext): ElementReport
}

/** 加权计分的权重配置 */
export interface WeightConfig {
  /** 天干 */
  stem: number
  /** 地支本气藏干 */
  hideMain: number
  /** 地支中气藏干 */
  hideMiddle: number
  /** 地支余气藏干 */
  hideResidual: number
  /** 月令地支及其藏干的加权倍数 */
  monthCommandMultiplier: number
}

export const DEFAULT_WEIGHTS: WeightConfig = {
  stem: 1,
  hideMain: 1,
  hideMiddle: 0.5,
  hideResidual: 0.3,
  monthCommandMultiplier: 1.5,
}

/** 保留两位小数，避免浮点尾数进到结果里 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 月令主导的旺相休囚死 */
function seasonalStates(monthElement: FiveElement): Record<ElementKey, string> {
  const m = Element.fromName(monthElement)
  const byName: Record<string, string> = {
    [m.getName()]: "旺",
    [m.getReinforce().getName()]: "相",
    [m.getReinforced().getName()]: "休",
    [m.getRestrained().getName()]: "囚",
    [m.getRestrain().getName()]: "死",
  }
  return Object.fromEntries(
    ELEMENT_KEY_ORDER.map((key) => [key, byName[ELEMENT_NAMES[key]]])
  ) as Record<ElementKey, string>
}

/**
 * 日主旺衰倾向
 *
 * 以同类占比分五档，分界线本身也是流派问题，跟着策略一起走
 */
function strengthOf(support: number, total: number): ElementReport["strength"] {
  if (total <= 0) return "中和"
  const ratio = support / total
  if (ratio >= 0.6) return "旺"
  if (ratio >= 0.5) return "偏旺"
  if (ratio >= 0.4) return "中和"
  if (ratio >= 0.3) return "偏弱"
  return "弱"
}

/** 按权重配置生成一个策略 */
export function createWeightedStrategy(
  name: string,
  description: string,
  weights: WeightConfig
): ElementStrategy {
  return {
    name,
    description,
    evaluate(ctx) {
      const scores = Object.fromEntries(
        ELEMENT_KEY_ORDER.map((key) => [key, 0])
      ) as Record<ElementKey, number>
      const contributions: ElementContribution[] = []

      const add = (
        element: FiveElement,
        weight: number,
        source: string,
        reason: string
      ) => {
        scores[ELEMENT_KEYS[element]] += weight
        contributions.push({ source, element, weight: round2(weight), reason })
      }

      for (const kind of PILLAR_KINDS) {
        const pillar = ctx.pillars[kind]
        const label = PILLAR_LABELS[kind]
        // 月令地支及其藏干加权，其余柱按基础权重
        const mul = kind === "month" ? weights.monthCommandMultiplier : 1

        add(
          pillar.stemElement,
          weights.stem,
          `${label}天干${pillar.stem}`,
          "天干本身"
        )

        for (const hide of pillar.hideStems) {
          const base =
            hide.type === "main"
              ? weights.hideMain
              : hide.type === "middle"
                ? weights.hideMiddle
                : weights.hideResidual
          const reason =
            kind === "month"
              ? `月令${hide.type === "main" ? "本气" : hide.type === "middle" ? "中气" : "余气"}，加权 ${mul} 倍`
              : hide.type === "main"
                ? "地支本气"
                : hide.type === "middle"
                  ? "地支中气"
                  : "地支余气"
          add(
            hide.element,
            base * mul,
            `${label}${pillar.branch}藏${hide.stem}`,
            reason
          )
        }
      }

      for (const key of ELEMENT_KEY_ORDER) {
        scores[key] = round2(scores[key])
      }
      const total = round2(
        ELEMENT_KEY_ORDER.reduce((sum, key) => sum + scores[key], 0)
      )

      // 同类为与日主同五行的比劫，加生日主的印星
      const self = Element.fromName(ctx.dayStemElement)
      const supportKeys: ElementKey[] = [
        ELEMENT_KEYS[self.getName() as FiveElement],
        ELEMENT_KEYS[self.getReinforced().getName() as FiveElement],
      ]
      const supportScore = round2(
        supportKeys.reduce((sum, key) => sum + scores[key], 0)
      )
      const opposeScore = round2(total - supportScore)

      return {
        strategy: name,
        scores,
        total,
        supportScore,
        opposeScore,
        strength: strengthOf(supportScore, total),
        seasonalState: seasonalStates(ctx.monthBranchElement),
        contributions,
      }
    },
  }
}

export const WEIGHTED_STRATEGY = createWeightedStrategy(
  "weighted",
  "天干 1、本气 1、中气 0.5、余气 0.3，月令部分再乘 1.5",
  DEFAULT_WEIGHTS
)

/**
 * 只数干支个数的朴素策略
 *
 * 用来对照加权策略，也证明策略确实可替换
 */
export const COUNT_STRATEGY: ElementStrategy = createWeightedStrategy(
  "count",
  "天干与地支本气各记 1 分，不计中气余气，月令不加权",
  {
    stem: 1,
    hideMain: 1,
    hideMiddle: 0,
    hideResidual: 0,
    monthCommandMultiplier: 1,
  }
)

export const ELEMENT_STRATEGIES: Record<string, ElementStrategy> = {
  [WEIGHTED_STRATEGY.name]: WEIGHTED_STRATEGY,
  [COUNT_STRATEGY.name]: COUNT_STRATEGY,
}

export function getElementStrategy(name: string): ElementStrategy {
  const s = ELEMENT_STRATEGIES[name]
  if (!s) {
    const known = Object.keys(ELEMENT_STRATEGIES).join("、")
    throw new Error(`未注册的五行评分策略 ${name}，已注册的有 ${known}`)
  }
  return s
}

/** 日主天干的五行 */
export function elementOfStem(stem: string): FiveElement {
  return HeavenStem.fromName(stem).getElement().getName() as FiveElement
}
