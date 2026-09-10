/**
 * 神煞匹配
 *
 * 查法全部收在 `data/shensha.ts` 的表里，这里只有一个通用匹配函数：
 * 取基准位的值 -> 查表得到命中值集合 -> 在允许的柱上按目标部位比对
 */

import { PILLAR_KINDS } from "./data/constants"
import { SHEN_SHA_RULES } from "./data/shensha"
import type { ShenShaBase, ShenShaRule, ShenShaTarget } from "./data/shensha"
import type { Pillar, PillarKind, ShenShaHit } from "./types"

/** 基准位在结果里的中文说法 */
const BASE_LABELS: Record<ShenShaBase, string> = {
  yearStem: "年干",
  yearBranch: "年支",
  monthBranch: "月支",
  dayStem: "日干",
  dayBranch: "日支",
  dayPillar: "日柱",
}

/** 一条规则的基准位落在哪一柱 */
const BASE_PILLARS: Record<ShenShaBase, PillarKind> = {
  yearStem: "year",
  yearBranch: "year",
  monthBranch: "month",
  dayStem: "day",
  dayBranch: "day",
  dayPillar: "day",
}

export interface ShenShaMatchOptions {
  /**
   * 基准柱自身不再标注该神煞
   *
   * 问真八字等工具用这个口径：将星以年支查，年支午自身即是将星，
   * 它只在时柱标将星、年柱不标。以日柱整体判定的规则（魁罡）不受此项影响，
   * 那类规则的基准与目标本就是同一柱
   */
  skipBasePillar?: boolean
}

/** 取一条规则的基准值 */
function baseValueOf(
  base: ShenShaBase,
  pillars: Record<PillarKind, Pillar>
): string {
  switch (base) {
    case "yearStem":
      return pillars.year.stem
    case "yearBranch":
      return pillars.year.branch
    case "monthBranch":
      return pillars.month.branch
    case "dayStem":
      return pillars.day.stem
    case "dayBranch":
      return pillars.day.branch
    case "dayPillar":
      return pillars.day.sixtyCycle
  }
}

/** 取一柱上被比对的那个值 */
function targetValueOf(target: ShenShaTarget, pillar: Pillar): string {
  switch (target) {
    case "stem":
      return pillar.stem
    case "branch":
      return pillar.branch
    case "sixtyCycle":
      return pillar.sixtyCycle
  }
}

/**
 * 按规则表匹配神煞
 *
 * @param pillars 四柱
 * @param rules 规则表，默认用内置的 `SHEN_SHA_RULES`
 */
export function matchShenSha(
  pillars: Record<PillarKind, Pillar>,
  rules: readonly ShenShaRule[] = SHEN_SHA_RULES,
  options: ShenShaMatchOptions = {}
): ShenShaHit[] {
  const hits: ShenShaHit[] = []

  for (const rule of rules) {
    const baseValue = baseValueOf(rule.base, pillars)
    // `dayPillar` 这类整体判定的规则用 "*" 作为唯一 key
    const wanted = rule.table[rule.base === "dayPillar" ? "*" : baseValue]
    if (!wanted || wanted.length === 0) continue

    const scope = rule.scope ?? PILLAR_KINDS
    for (const kind of scope) {
      if (
        options.skipBasePillar &&
        rule.base !== "dayPillar" &&
        kind === BASE_PILLARS[rule.base]
      ) {
        continue
      }
      const pillar = pillars[kind]
      const value = targetValueOf(rule.target, pillar)
      if (!wanted.includes(value)) continue
      hits.push({
        name: rule.name,
        pillar: kind,
        matched: value,
        by: `${BASE_LABELS[rule.base]}${baseValue}`,
        note: rule.note,
      })
    }
  }

  return hits
}

/** 把命中结果按柱归拢，界面按柱一列一列显示 */
export function groupShenShaByPillar(
  hits: readonly ShenShaHit[]
): Record<PillarKind, ShenShaHit[]> {
  const grouped = Object.fromEntries(
    PILLAR_KINDS.map((k) => [k, [] as ShenShaHit[]])
  ) as Record<PillarKind, ShenShaHit[]>
  for (const h of hits) {
    grouped[h.pillar].push(h)
  }
  return grouped
}
