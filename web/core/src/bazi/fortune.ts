/**
 * 大运、流年、流月、小运与起运
 *
 * 起运的时间折算交给 `tyme4ts` 的 `ChildLimit`，它把「3 天折 1 岁、1 天折 4 个月、
 * 1 时辰折 10 天」这套线性折算实现成了可替换的 `provider`，正好对上 `qiYunPrecision`
 *
 * 大运与小运的干支自己推：大运从月柱起步、小运从时柱起步，都按顺逆方向走。
 * 这样晚子时算当天时，小运跟的是本派推出的时柱，而不是 `tyme4ts` 内部那一套
 */

import {
  ChildLimit,
  China95ChildLimitProvider,
  Gender,
  HeavenStem,
  LunarSect2ChildLimitProvider,
  SixtyCycle,
  SixtyCycleYear,
  SolarTerm,
  SolarTime,
} from "tyme4ts"

import type { ChildLimitProvider } from "tyme4ts"

import { branchTenStarOf, tenStarOf } from "./derived"
import { formatTime } from "../birth/util"
import type { Gender as ChartGender } from "../birth/types"
import type {
  DecadeFortuneStep,
  FortuneMonth,
  FortuneYear,
  QiYun,
  QiYunPrecision,
} from "./types"

/** 起运折算精度到 `tyme4ts` provider 的映射 */
const QI_YUN_PROVIDERS: Record<QiYunPrecision, () => ChildLimitProvider> = {
  // 折到日：3 天 1 岁、1 天 4 个月，余下的时辰丢掉
  day: () => new China95ChildLimitProvider(),
  // 折到时辰：日之后继续按 1 时辰 10 天折算
  hour: () => new LunarSect2ChildLimitProvider(),
}

/**
 * 在指定 provider 下取一次起运信息
 *
 * `ChildLimit.provider` 是静态属性，用完必须还原，否则会串到下一次排盘
 */
function withProvider<T>(precision: QiYunPrecision, fn: () => T): T {
  const saved = ChildLimit.provider
  ChildLimit.provider = QI_YUN_PROVIDERS[precision]()
  try {
    return fn()
  } finally {
    ChildLimit.provider = saved
  }
}

function genderOf(g: ChartGender): Gender {
  return g === "male" ? Gender.MAN : Gender.WOMAN
}

/** 拼出「出生后 0 年 10 月 12 天 4 时起运」这样的说法 */
function qiYunText(
  yearCount: number,
  monthCount: number,
  dayCount: number,
  hourCount: number,
  precision: QiYunPrecision
): string {
  const parts = [`${yearCount} 年`, `${monthCount} 月`, `${dayCount} 天`]
  if (precision === "hour") {
    parts.push(`${hourCount} 时`)
  }
  return `出生后 ${parts.join(" ")} 起运`
}

export interface FortuneContext {
  /** 实际用于排盘的出生时刻 */
  birthTime: SolarTime
  gender: ChartGender
  /** 本派推出的四柱 */
  monthPillar: SixtyCycle
  hourPillar: SixtyCycle
  dayStem: HeavenStem
  precision: QiYunPrecision
  /** 流年输出到多少虚岁 */
  maxAge: number
}

export interface FortuneResult {
  qiYun: QiYun
  decades: DecadeFortuneStep[]
}

/** 一个干支的天干、地支十神对 */
function tenStars(dayStem: HeavenStem, cycle: SixtyCycle) {
  return {
    stemTenStar: tenStarOf(dayStem, cycle.getHeavenStem()),
    branchTenStar: branchTenStarOf(dayStem, cycle.getEarthBranch()),
  }
}

/** 小运：从时柱起步，按虚岁逐年推一位 */
export function minorFortuneOf(
  hourPillar: SixtyCycle,
  age: number,
  forward: boolean
): SixtyCycle {
  return hourPillar.next(forward ? age : -age)
}

export function buildFortune(ctx: FortuneContext): FortuneResult {
  const { birthTime, monthPillar, hourPillar, dayStem, precision, maxAge } = ctx

  const limit = withProvider(precision, () =>
    ChildLimit.fromSolarTime(birthTime, genderOf(ctx.gender))
  )

  const forward = limit.isForward()
  const birthYear = birthTime.getYear()
  // 起运那一年，第一步大运从这一年开始
  const startYear = limit.getEndTime().getYear()
  const startAge = startYear - birthYear + 1

  // 折算所依据的节：顺排取下一个节，逆排取上一个节
  let term = birthTime.getTerm()
  if (!term.isJie()) {
    term = term.next(-1)
  }
  if (forward) {
    term = term.next(2)
  }

  const qiYun: QiYun = {
    forward,
    yearCount: limit.getYearCount(),
    monthCount: limit.getMonthCount(),
    dayCount: limit.getDayCount(),
    hourCount: limit.getHourCount(),
    minuteCount: limit.getMinuteCount(),
    startTime: formatTime(limit.getEndTime()),
    startAge,
    term: {
      name: term.getName(),
      time: formatTime(term.getJulianDay().getSolarTime()),
    },
    precision,
    text: qiYunText(
      limit.getYearCount(),
      limit.getMonthCount(),
      limit.getDayCount(),
      limit.getHourCount(),
      precision
    ),
  }

  const decades: DecadeFortuneStep[] = []
  const stepCount = Math.max(1, Math.ceil((maxAge - startAge + 1) / 10))

  for (let i = 0; i < stepCount; i++) {
    // 大运干支从月柱起步，每步走一位
    const cycle = monthPillar.next(forward ? i + 1 : -i - 1)
    const stepStartAge = startAge + i * 10
    const stepStartYear = startYear + i * 10

    const years: FortuneYear[] = []
    for (let k = 0; k < 10; k++) {
      const age = stepStartAge + k
      if (age > maxAge) break
      const year = stepStartYear + k
      const yc = SixtyCycleYear.fromYear(year).getSixtyCycle()
      years.push({
        year,
        age,
        sixtyCycle: yc.getName(),
        ...tenStars(dayStem, yc),
        minorFortune: minorFortuneOf(hourPillar, age, forward).getName(),
      })
    }

    decades.push({
      index: i,
      sixtyCycle: cycle.getName(),
      ...tenStars(dayStem, cycle),
      startAge: stepStartAge,
      endAge: stepStartAge + 9,
      startYear: stepStartYear,
      endYear: stepStartYear + 9,
      years,
    })
  }

  return { qiYun, decades }
}

/**
 * 起运之前的那几年，只有小运没有大运
 *
 * 虚岁从 1 数到起运虚岁的前一年
 */
export function buildPreFortuneYears(
  birthYear: number,
  startAge: number,
  hourPillar: SixtyCycle,
  dayStem: HeavenStem,
  forward: boolean
): FortuneYear[] {
  const list: FortuneYear[] = []
  for (let age = 1; age < startAge; age++) {
    const year = birthYear + age - 1
    const yc = SixtyCycleYear.fromYear(year).getSixtyCycle()
    list.push({
      year,
      age,
      sixtyCycle: yc.getName(),
      ...tenStars(dayStem, yc),
      minorFortune: minorFortuneOf(hourPillar, age, forward).getName(),
    })
  }
  return list
}

/**
 * 某个干支年的十二个流月
 *
 * 以十二节为界，立春起为寅月，交节时刻取自寿星天文历
 */
export function buildFortuneMonths(
  year: number,
  dayStem: HeavenStem
): FortuneMonth[] {
  return SixtyCycleYear.fromYear(year)
    .getMonths()
    .map((m) => {
      const cycle = m.getSixtyCycle()
      // 立春在 `SolarTerm` 里的序号是 3，之后每两个序号进一节
      const term = SolarTerm.fromIndex(year, 3 + m.getIndexInYear() * 2)
      return {
        termName: term.getName(),
        termTime: formatTime(term.getJulianDay().getSolarTime()),
        sixtyCycle: cycle.getName(),
        ...tenStars(dayStem, cycle),
      }
    })
}
