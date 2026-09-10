/**
 * 四柱
 *
 * 年柱以立春交节时刻为界、月柱以十二节为界、日柱六十甲子连续计数、时柱按十二时辰，
 * 这四条 `tyme4ts` 的 `SixtyCycleHour` 已经实现且节气取自寿星天文历，直接复用
 *
 * 自实现的只有早晚子时分支：`tyme4ts` 把 23:00 起的日柱推到次日、时干跟随次日日干，
 * 相当于 `lateZiAsNextDay` 为 `true`；`false` 时需要把日柱退回当天并按当天日干重推时干
 */

import {
  EarthBranch,
  HeavenStem,
  SixtyCycle,
  SixtyCycleHour,
  SolarTime,
} from "tyme4ts"

import { EARTH_BRANCHES } from "./data/constants"

export interface FourPillars {
  year: SixtyCycle
  month: SixtyCycle
  day: SixtyCycle
  hour: SixtyCycle
}

/**
 * 钟表小时对应的时辰地支
 *
 * 子时 23 至 1、丑时 1 至 3，依此类推；23 点与 0 点同属子时，早晚子时的日柱归属另由 `lateZiAsNextDay` 决定
 */
export function hourBranchOf(hour: number): string {
  return EARTH_BRANCHES[Math.floor((hour + 1) / 2) % 12]
}

/**
 * 五鼠遁：由日干与时支推时干
 *
 * `时干 = (日干序 % 5 * 2 + 时支序) % 10`，甲为 0、子为 0
 */
export function hourStemOf(
  dayStem: HeavenStem,
  hourBranch: EarthBranch
): HeavenStem {
  return HeavenStem.fromIndex(
    ((dayStem.getIndex() % 5) * 2 + hourBranch.getIndex()) % 10
  )
}

/**
 * 五虎遁：由年干与月支推月干
 *
 * `月干 = (年干序 % 5 * 2 + 2 + 月序) % 10`，寅月月序为 0
 *
 * `tyme4ts` 内部已按此推月柱，这里单独导出用于交叉校验
 */
export function monthStemOf(
  yearStem: HeavenStem,
  monthIndexFromTiger: number
): HeavenStem {
  return HeavenStem.fromIndex(
    ((yearStem.getIndex() % 5) * 2 + 2 + monthIndexFromTiger) % 10
  )
}

/** 由干支两字拼出一个 `SixtyCycle` */
function pillarOf(stem: HeavenStem, branch: EarthBranch): SixtyCycle {
  return SixtyCycle.fromName(stem.getName() + branch.getName())
}

/**
 * 排四柱
 *
 * @param t 已完成夏令时与真太阳时校正、实际用于排盘的时刻
 * @param lateZiAsNextDay 晚子时是否算次日日柱
 */
export function buildFourPillars(
  t: SolarTime,
  lateZiAsNextDay: boolean
): FourPillars {
  const h = SixtyCycleHour.fromSolarTime(t)
  const base: FourPillars = {
    year: h.getYear(),
    month: h.getMonth(),
    day: h.getDay(),
    hour: h.getSixtyCycle(),
  }

  // 只有 23:00 至 23:59 这一小时存在分歧，其余时刻两派一致
  if (t.getHour() !== 23 || lateZiAsNextDay) {
    return base
  }

  // 晚子时算当天：日柱退回当天，时支仍为子，时干跟随当天日干
  const day = base.day.next(-1)
  const hour = pillarOf(
    hourStemOf(day.getHeavenStem(), EarthBranch.fromName("子")),
    EarthBranch.fromName("子")
  )
  return { ...base, day, hour }
}

/**
 * 一个时刻所属的干支年年份
 *
 * 干支年以立春为界，立春前算前一年，流月要按这个年份取
 */
export function sixtyCycleYearOf(t: SolarTime): number {
  return SixtyCycleHour.fromSolarTime(t)
    .getSixtyCycleDay()
    .getSixtyCycleMonth()
    .getSixtyCycleYear()
    .getYear()
}
