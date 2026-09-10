/**
 * 干支基础常量
 *
 * 干支、五行、阴阳、藏干、纳音、长生这些表 `tyme4ts` 已经内置且经过验证，
 * 算法层一律走 `tyme4ts`，本文件只放 `tyme4ts` 未直接暴露、或界面渲染需要的常量
 */

import type { ElementKey, FiveElement, HideStemType, PillarKind } from "../types"

export const HEAVEN_STEMS = [
  "甲",
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
] as const

export const EARTH_BRANCHES = [
  "子",
  "丑",
  "寅",
  "卯",
  "辰",
  "巳",
  "午",
  "未",
  "申",
  "酉",
  "戌",
  "亥",
] as const

export const FIVE_ELEMENTS: readonly FiveElement[] = [
  "木",
  "火",
  "土",
  "金",
  "水",
]

/** 五行到序列化键的映射 */
export const ELEMENT_KEYS: Record<FiveElement, ElementKey> = {
  木: "wood",
  火: "fire",
  土: "earth",
  金: "metal",
  水: "water",
}

/** 序列化键到五行的映射，界面按这个把 `wood` 显示成「木」 */
export const ELEMENT_NAMES: Record<ElementKey, FiveElement> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
}

/** 五行的序列化键，顺序与 `FIVE_ELEMENTS` 一致 */
export const ELEMENT_KEY_ORDER: readonly ElementKey[] = [
  "wood",
  "fire",
  "earth",
  "metal",
  "water",
]

export const PILLAR_KINDS: readonly PillarKind[] = [
  "year",
  "month",
  "day",
  "hour",
]

export const PILLAR_LABELS: Record<PillarKind, string> = {
  year: "年柱",
  month: "月柱",
  day: "日柱",
  hour: "时柱",
}

/** 十神简称，问真等排盘工具在大运流年格里用简称省地方 */
export const TEN_STAR_SHORT: Record<string, string> = {
  比肩: "比",
  劫财: "劫",
  食神: "食",
  伤官: "伤",
  偏财: "才",
  正财: "财",
  七杀: "杀",
  正官: "官",
  偏印: "枭",
  正印: "印",
}

/** 藏干层次的中文名 */
export const HIDE_STEM_LABELS: Record<HideStemType, string> = {
  main: "本气",
  middle: "中气",
  residual: "余气",
}

/**
 * 十二地支对应的月序，寅月为 0
 *
 * 立春起为寅月，这是月柱以节为界的排法
 */
export const BRANCH_MONTH_INDEX: Record<string, number> = {
  寅: 0,
  卯: 1,
  辰: 2,
  巳: 3,
  午: 4,
  未: 5,
  申: 6,
  酉: 7,
  戌: 8,
  亥: 9,
  子: 10,
  丑: 11,
}

/** 十二节，月柱的分界，立春起 */
export const TWELVE_JIE = [
  "立春",
  "惊蛰",
  "清明",
  "立夏",
  "芒种",
  "小暑",
  "立秋",
  "白露",
  "寒露",
  "立冬",
  "大雪",
  "小寒",
] as const

/**
 * 月令五行的旺相休囚死
 *
 * 以月令所属五行为「旺」，其所生为「相」，生它的为「休」，克它的为「囚」，它所克的为「死」
 */
export const SEASONAL_STATES = ["旺", "相", "休", "囚", "死"] as const
