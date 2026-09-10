/**
 * 柱的派生项：十神、藏干、纳音、十二长生、旬空
 *
 * 这五张表 `tyme4ts` 都已内置，本文件只做组装与命名映射
 */

import {
  EarthBranch,
  HeavenStem,
  HideHeavenStemType,
  SixtyCycle,
} from "tyme4ts"

import type {
  FiveElement,
  HideStem,
  HideStemType,
  Pillar,
  PillarKind,
} from "./types"

const HIDE_TYPE_MAP: Record<number, HideStemType> = {
  [HideHeavenStemType.MAIN]: "main",
  [HideHeavenStemType.MIDDLE]: "middle",
  [HideHeavenStemType.RESIDUAL]: "residual",
}

/** 某个天干对日主的十神，日主自身记作 `日主` */
export function tenStarOf(dayStem: HeavenStem, target: HeavenStem): string {
  return dayStem.getTenStar(target).getName()
}

/** 地支的藏干，按本气、中气、余气排列 */
export function hideStemsOf(
  dayStem: HeavenStem,
  branch: EarthBranch
): HideStem[] {
  return branch.getHideHeavenStems().map((h) => {
    const stem = h.getHeavenStem()
    return {
      stem: stem.getName(),
      type: HIDE_TYPE_MAP[h.getType()],
      tenStar: tenStarOf(dayStem, stem),
      element: stem.getElement().getName() as FiveElement,
    }
  })
}

/** 地支本气藏干对日主的十神，大运流年格里的地支十神取这一位 */
export function branchTenStarOf(
  dayStem: HeavenStem,
  branch: EarthBranch
): string {
  return tenStarOf(dayStem, branch.getHideHeavenStemMain())
}

/**
 * 组装一柱
 *
 * @param emptyBranches 日柱旬空的两个地支，用于标注本柱地支是否落空
 */
export function buildPillar(
  kind: PillarKind,
  cycle: SixtyCycle,
  dayStem: HeavenStem,
  emptyBranches: readonly string[]
): Pillar {
  const stem = cycle.getHeavenStem()
  const branch = cycle.getEarthBranch()
  return {
    kind,
    sixtyCycle: cycle.getName(),
    stem: stem.getName(),
    branch: branch.getName(),
    stemElement: stem.getElement().getName() as FiveElement,
    branchElement: branch.getElement().getName() as FiveElement,
    stemTenStar: kind === "day" ? "日主" : tenStarOf(dayStem, stem),
    hideStems: hideStemsOf(dayStem, branch),
    sound: cycle.getSound().getName(),
    terrain: dayStem.getTerrain(branch).getName(),
    selfTerrain: stem.getTerrain(branch).getName(),
    ten: cycle.getTen().getName(),
    extraBranches: cycle.getExtraEarthBranches().map((b) => b.getName()),
    empty: emptyBranches.includes(branch.getName()),
  }
}
