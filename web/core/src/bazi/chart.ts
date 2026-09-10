/**
 * 排盘主流程
 *
 * `paipan(input)` 是本模块唯一的入口，纯函数、不碰网络与 DOM，结果可直接 `JSON.stringify`
 */

import { EarthBranch, EightChar, HeavenStem, SixtyCycle } from "tyme4ts"

import { PILLAR_KINDS } from "./data/constants"
import { buildPillar } from "./derived"
import { elementOfStem, getElementStrategy } from "./elements"
import { buildFortune, buildFortuneMonths } from "./fortune"
import { buildFourPillars, sixtyCycleYearOf } from "./pillars"
import { matchShenSha } from "./shensha"
import { correctTime } from "./time"
import type {
  Chart,
  FiveElement,
  FortuneMonth,
  PaipanInput,
  PaipanOptions,
  Pillar,
  PillarKind,
} from "./types"

/**
 * 选项默认值
 *
 * 每一项都对应一处流派分歧，取值理由见 `README`
 */
export const DEFAULT_OPTIONS: PaipanOptions = {
  useTrueSolarTime: false,
  useDaylightSaving: false,
  lateZiAsNextDay: false,
  qiYunPrecision: "hour",
  shenShaSkipBasePillar: false,
  maxAge: 100,
  elementStrategy: "weighted",
}

/**
 * 合并选项
 *
 * 值为 `undefined` 的键当作没传，不会把默认值冲掉。对象展开做不到这一点，
 * 而来自 HTTP 请求解析的选项对象常带着一堆 `undefined`
 */
export function resolveOptions(
  partial?: Partial<PaipanOptions>
): PaipanOptions {
  const merged: PaipanOptions = { ...DEFAULT_OPTIONS }
  if (!partial) return merged
  // 只认 `DEFAULT_OPTIONS` 里有的键，未知键一并忽略
  for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof PaipanOptions)[]) {
    const value = partial[key]
    if (value !== undefined) {
      merged[key] = value as never
    }
  }
  return merged
}

export function paipan(
  input: PaipanInput,
  partial?: Partial<PaipanOptions>
): Chart {
  const options = resolveOptions(partial)
  const { effective, info } = correctTime(input, options)

  const four = buildFourPillars(effective, options.lateZiAsNextDay)
  const dayStem = four.day.getHeavenStem()
  const emptyBranches = four.day.getExtraEarthBranches().map((b) => b.getName())

  const cycles: Record<PillarKind, SixtyCycle> = {
    year: four.year,
    month: four.month,
    day: four.day,
    hour: four.hour,
  }
  const pillars = Object.fromEntries(
    PILLAR_KINDS.map((k) => [
      k,
      buildPillar(k, cycles[k], dayStem, emptyBranches),
    ])
  ) as Record<PillarKind, Pillar>

  const dayStemElement = elementOfStem(dayStem.getName())
  const elements = getElementStrategy(options.elementStrategy).evaluate({
    pillars,
    dayStem: dayStem.getName(),
    dayStemElement,
    monthBranch: pillars.month.branch,
    monthBranchElement: pillars.month.branchElement,
  })

  const { qiYun, decades } = buildFortune({
    birthTime: effective,
    gender: input.gender,
    monthPillar: four.month,
    hourPillar: four.hour,
    dayStem,
    precision: options.qiYunPrecision,
    maxAge: options.maxAge,
  })

  // 胎元、胎息、命宫、身宫都只依赖四柱，直接从本派四柱构造，不再走一遍时刻推算
  const eightChar = new EightChar(four.year, four.month, four.day, four.hour)

  const location =
    input.location !== undefined ||
    input.longitude !== undefined ||
    input.latitude !== undefined
      ? {
          name: input.location,
          longitude: input.longitude,
          latitude: input.latitude,
        }
      : undefined

  return {
    name: input.name,
    gender: input.gender,
    input,
    options,
    location,
    time: {
      ...info,
      zodiac: EarthBranch.fromName(pillars.year.branch).getZodiac().getName(),
    },
    pillars,
    dayStem: dayStem.getName(),
    dayStemElement: dayStemElement as FiveElement,
    emptyBranches,
    elements,
    shenSha: matchShenSha(pillars, undefined, {
      skipBasePillar: options.shenShaSkipBasePillar,
    }),
    qiYun,
    decades,
    months: buildFortuneMonths(sixtyCycleYearOf(effective), dayStem),
    extras: {
      fetalOrigin: eightChar.getFetalOrigin().getName(),
      fetalBreath: eightChar.getFetalBreath().getName(),
      ownSign: eightChar.getOwnSign().getName(),
      bodySign: eightChar.getBodySign().getName(),
    },
  }
}

/**
 * 取任意一个干支年的流月
 *
 * 界面上点选流年后要看那一年的流月，`Chart.months` 只带出生当年的
 */
export function monthsOfYear(chart: Chart, year: number): FortuneMonth[] {
  return buildFortuneMonths(year, HeavenStem.fromName(chart.dayStem))
}
