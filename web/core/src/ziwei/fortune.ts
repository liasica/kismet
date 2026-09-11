/**
 * 运限：长生与博士十二神、大限、小限、流曜、流年与所处运限
 *
 * 大限自命宫起，阳男阴女顺行、阴男阳女逆行，起限岁数即局数；
 * 小限男顺女逆不分阴阳；流年以太岁宫为命宫，流曜按流年干支起；
 * 虚岁与流年都以农历年（正月初一）为界
 */

import { LunarYear, SolarDay } from "tyme4ts"

import { EARTH_BRANCHES, HEAVEN_STEMS } from "../birth/constants"
import {
  BO_SHI,
  branchIndex,
  CHANG_SHENG,
  CHANG_SHENG_START,
  GENERAL_START,
  JIANG_QIAN,
  LIU_CHANG,
  LIU_QU,
  LU_CUN,
  MINOR_LIMIT_START,
  mod,
  MUTATION_TABLE,
  MUTATIONS,
  stemIndex,
  SUI_QIAN,
  TIAN_KUI,
  TIAN_MA,
  TIAN_YUE,
} from "./data/tables"
import type {
  Decade,
  ZiweiChart,
  ZiweiFlow,
  ZiweiLimit,
  ZiweiMutation,
  ZiweiYear,
} from "./types"

/** 十二神按地支排列：起点宫放第一位，顺者顺行、逆者逆行 */
function twelveByBranch(
  names: readonly string[],
  start: number,
  forward: boolean
): string[] {
  const out = new Array<string>(12).fill("")
  names.forEach((name, i) => {
    out[mod(start + (forward ? i : -i), 12)] = name
  })
  return out
}

/** 长生十二神，起点按五行局 */
export function changShengOf(bureau: number, forward: boolean): string[] {
  return twelveByBranch(CHANG_SHENG, CHANG_SHENG_START[bureau]!, forward)
}

/** 博士十二神，从禄存起 */
export function boShiOf(luCun: number, forward: boolean): string[] {
  return twelveByBranch(BO_SHI, luCun, forward)
}

/** 岁前十二神，从流年太岁起顺行 */
export function suiQianOf(yearBranch: number): string[] {
  return twelveByBranch(SUI_QIAN, yearBranch, true)
}

/** 将前十二神，从流年三合局的旺地起顺行 */
export function jiangQianOf(yearBranch: number): string[] {
  return twelveByBranch(JIANG_QIAN, GENERAL_START[yearBranch % 4]!, true)
}

/** 大限按地支排列，起限岁数即局数，每宫十年 */
export function decadesOf(
  lifePalace: number,
  forward: boolean,
  bureau: number,
  birthYear: number
): Decade[] {
  const out: Decade[] = []
  for (let i = 0; i < 12; i++) {
    const startAge = bureau + 10 * i
    out[mod(lifePalace + (forward ? i : -i), 12)] = {
      index: i,
      startAge,
      endAge: startAge + 9,
      startYear: birthYear + startAge - 1,
      endYear: birthYear + startAge + 8,
    }
  }
  return out
}

/** 某个虚岁的小限所在宫：一岁起于年支三合局墓库之冲，男顺女逆 */
export function minorLimitBranchOf(
  yearBranch: number,
  male: boolean,
  age: number
): number {
  return mod(
    MINOR_LIMIT_START[yearBranch % 4]! + (male ? age - 1 : 1 - age),
    12
  )
}

/** 小限落在各宫的虚岁，按地支排列 */
export function minorLimitAgesOf(
  yearBranch: number,
  male: boolean,
  maxAge: number
): number[][] {
  const out: number[][] = EARTH_BRANCHES.map(() => [])
  for (let age = 1; age <= maxAge; age++) {
    out[minorLimitBranchOf(yearBranch, male, age)]!.push(age)
  }
  return out
}

/** 某个天干的四化，按禄权科忌 */
export function mutationsOf(stem: number): ZiweiMutation[] {
  return MUTATION_TABLE[stem]!.map((star, i) => ({
    star,
    mutation: MUTATIONS[i]!,
  }))
}

/**
 * 大限或流年的流曜
 *
 * 流禄羊陀、流魁钺、流昌曲与流四化按干起，流马按支起，流年另有年解。
 * 起法与起星盘相同，但不写入命盘
 */
export function flowOf(
  scope: "decade" | "year",
  stem: number,
  branch: number,
  lifePalace: number
): ZiweiFlow {
  const luCun = LU_CUN[stem]!
  const stars: Array<[string, number]> = [
    ["流禄", luCun],
    ["流羊", luCun + 1],
    ["流陀", luCun - 1],
    ["流魁", TIAN_KUI[stem]!],
    ["流钺", TIAN_YUE[stem]!],
    ["流昌", LIU_CHANG[stem]!],
    ["流曲", LIU_QU[stem]!],
    ["流马", TIAN_MA[branch % 4]!],
  ]
  if (scope === "year") stars.push(["年解", 10 - branch])

  return {
    scope,
    stem: HEAVEN_STEMS[stem]!,
    branch: EARTH_BRANCHES[branch]!,
    sixtyCycle: HEAVEN_STEMS[stem]! + EARTH_BRANCHES[branch]!,
    lifePalace: EARTH_BRANCHES[lifePalace]!,
    stars: stars.map(([name, at]) => ({
      name,
      branch: EARTH_BRANCHES[mod(at, 12)]!,
    })),
    mutations: mutationsOf(stem),
  }
}

/** 农历年的干支索引 `[干, 支]` */
export function lunarYearCycle(year: number): [number, number] {
  const name = LunarYear.fromYear(year).getSixtyCycle().getName()
  return [stemIndex(name[0]!), branchIndex(name[1]!)]
}

/** 第 `index` 步大限的流曜，按大限宫的干支起 */
export function ziweiDecadeFlow(chart: ZiweiChart, index: number): ZiweiFlow {
  const palace = chart.palaces.find((p) => p.decade.index === index)
  if (!palace) {
    throw new Error(`大限序号应在 0 到 11 之间，收到 ${index}`)
  }
  const branch = branchIndex(palace.branch)
  return flowOf("decade", stemIndex(palace.stem), branch, branch)
}

/** 某个农历年的流年 */
export function ziweiYearly(chart: ZiweiChart, year: number): ZiweiYear {
  const [stem, branch] = lunarYearCycle(year)
  const age = year - chart.lunar.year + 1
  const male = chart.gender === "male"
  // 斗君：太岁宫起正月逆数至生月，再从该宫起子时顺数至生时
  const douJun = mod(
    branch -
      (chart.lunar.effectiveMonth - 1) +
      branchIndex(chart.lunar.hourBranch),
    12
  )

  return {
    ...flowOf("year", stem, branch, branch),
    year,
    age,
    suiQian: suiQianOf(branch),
    jiangQian: jiangQianOf(branch),
    douJun: EARTH_BRANCHES[douJun]!,
    minorLimit:
      EARTH_BRANCHES[
        minorLimitBranchOf(branchIndex(chart.yearBranch), male, age)
      ]!,
  }
}

/** 某个公历日期所处的运限，虚岁与流年都以农历年为界，起限之前没有大限 */
export function ziweiLimitAt(
  chart: ZiweiChart,
  date: { year: number; month: number; day: number }
): ZiweiLimit {
  const lunarYear = SolarDay.fromYmd(date.year, date.month, date.day)
    .getLunarDay()
    .getLunarMonth()
    .getLunarYear()
    .getYear()
  const yearly = ziweiYearly(chart, lunarYear)
  const decade = chart.palaces
    .map((p) => p.decade)
    .find((d) => d.startAge <= yearly.age && yearly.age <= d.endAge)
  return { lunarYear, age: yearly.age, decade, yearly }
}
