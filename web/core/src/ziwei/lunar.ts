/**
 * 农历生辰
 *
 * 紫微斗数以农历为基础：年以正月初一为界、月按农历月，不看节气。
 * 农历换算全部走 `tyme4ts`，本文件只处理闰月归属与晚子时
 */

import type { SolarTime } from "tyme4ts"

/** 排盘用到的农历生辰，`hourBranchIndex` 是时支索引 */
export interface LunarBirth {
  year: number
  yearSixtyCycle: string
  month: number
  leap: boolean
  day: number
  effectiveMonth: number
  hourBranchIndex: number
  text: string
}

/** 钟表小时对应的时支索引，23 点与 0 点同属子 */
export function hourBranchIndex(hour: number): number {
  return Math.floor((hour + 1) / 2) % 12
}

/**
 * 安星所用的月份
 *
 * 闰月初一至十五按本月推算，十六起按下一个月；闰十二月十六起按正月，年干支不变
 */
export function effectiveMonthOf(
  month: number,
  leap: boolean,
  day: number
): number {
  if (!leap || day <= 15) return month
  return month === 12 ? 1 : month + 1
}

/**
 * 从校正后的时刻取农历生辰
 *
 * 中州派以零时为一日之始，23 点仍属当日；`lateZiAsNextDay` 打开时把 23 点推到次日
 */
export function lunarBirthOf(
  effective: SolarTime,
  lateZiAsNextDay: boolean
): LunarBirth {
  let solarDay = effective.getSolarDay()
  if (lateZiAsNextDay && effective.getHour() === 23) {
    solarDay = solarDay.next(1)
  }
  const lunarDay = solarDay.getLunarDay()
  const lunarMonth = lunarDay.getLunarMonth()
  const lunarYear = lunarMonth.getLunarYear()
  const month = Math.abs(lunarMonth.getMonthWithLeap())
  const leap = lunarMonth.isLeap()
  const day = lunarDay.getDay()

  return {
    year: lunarYear.getYear(),
    yearSixtyCycle: lunarYear.getSixtyCycle().getName(),
    month,
    leap,
    day,
    effectiveMonth: effectiveMonthOf(month, leap, day),
    hourBranchIndex: hourBranchIndex(effective.getHour()),
    text: lunarDay.toString(),
  }
}
