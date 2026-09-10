/**
 * 时间校正
 *
 * 输入一律当作北京时间（UTC+8）的**钟表读数**，依次过三道校正：
 * 1. 夏令时：1986 至 1991 年落在夏令时区间的读数回拨一小时，得到标准北京时间
 * 2. 经度差：地方平时 = 标准北京时间 + (经度 - 120) x 4 分钟
 * 3. 均时差：真太阳时 = 地方平时 + 均时差
 *
 * 三道都会在结果里留下偏移量，原始时刻与校正后时刻同时保留
 */

import { SolarTime } from "tyme4ts"

import { DST_OFFSET_MINUTES, isInChinaDst } from "./data/daylight-saving"
import { equationOfTime } from "./equation-of-time"
import { formatTime, shiftSeconds } from "./util"
import type { PaipanInput, PaipanOptions, TermPoint, TimeInfo } from "./types"

/** 北京时间的标准经线 */
const BEIJING_MERIDIAN = 120

/** 地球自转 1 度对应的时间分钟数 */
const MINUTES_PER_DEGREE = 4

/** 北京时间相对世界时的小时数 */
const BEIJING_UTC_OFFSET_HOURS = 8

export interface CorrectedTime {
  /** 实际用于排盘的时刻 */
  effective: SolarTime
  /** 生肖按年柱地支取，由排盘主流程补上 */
  info: Omit<TimeInfo, "zodiac">
}

/**
 * 取到最近的整分钟
 *
 * 输入本身只精确到分，秒位是校正累积出来的，留着会让起运折算的时辰位漂移。
 * 四舍五入而不是截断：截断的偏差可达 60 秒，遇到时辰边界会把人推到前一个时辰
 */
function roundToMinute(t: SolarTime): SolarTime {
  return t.next(t.getSecond() >= 30 ? 60 - t.getSecond() : -t.getSecond())
}

function termPointOf(name: string, t: SolarTime): TermPoint {
  return { name, time: formatTime(t) }
}

/**
 * 校正时刻
 *
 * @throws 开启真太阳时但没给经度时抛错，这是调用方的输入错误，不做静默降级
 */
export function correctTime(
  input: PaipanInput,
  options: PaipanOptions
): CorrectedTime {
  const { year, month, day, hour, minute } = input

  const raw = SolarTime.fromYmdHms(year, month, day, hour, minute, 0)

  const dstHit =
    options.useDaylightSaving && isInChinaDst(year, month, day, hour, minute)
  const daylightSavingMinutes = dstHit ? -DST_OFFSET_MINUTES : 0
  const standard = dstHit ? shiftSeconds(raw, daylightSavingMinutes * 60) : raw

  let longitudeMinutes = 0
  let equationOfTimeMinutes = 0
  let meanSolar = standard
  let effective = standard

  if (options.useTrueSolarTime) {
    if (input.longitude === undefined) {
      throw new Error("开启真太阳时必须提供出生地经度 longitude")
    }
    longitudeMinutes = (input.longitude - BEIJING_MERIDIAN) * MINUTES_PER_DEGREE
    meanSolar = shiftSeconds(standard, longitudeMinutes * 60)
    // 均时差按标准北京时间对应的世界时求值
    equationOfTimeMinutes = equationOfTime(
      standard.getYear(),
      standard.getMonth(),
      standard.getDay(),
      standard.getHour() - BEIJING_UTC_OFFSET_HOURS,
      standard.getMinute()
    )
    effective = roundToMinute(
      shiftSeconds(meanSolar, equationOfTimeMinutes * 60)
    )
  }

  // 上一个节与下一个节，用于月柱归属与起运折算的交叉核对
  let jie = effective.getTerm()
  if (!jie.isJie()) {
    jie = jie.next(-1)
  }
  const nextJie = jie.next(2)
  const term = effective.getTerm()

  const lunarDay = effective.getSolarDay().getLunarDay()

  const info: Omit<TimeInfo, "zodiac"> = {
    input: formatTime(raw),
    standard: formatTime(standard),
    effective: formatTime(effective),
    daylightSavingMinutes,
    longitudeMinutes: Math.round(longitudeMinutes * 100) / 100,
    equationOfTimeMinutes: Math.round(equationOfTimeMinutes * 100) / 100,
    meanSolar: formatTime(meanSolar),
    lunar: lunarDay.toString(),
    term: termPointOf(term.getName(), term.getJulianDay().getSolarTime()),
    prevJie: termPointOf(jie.getName(), jie.getJulianDay().getSolarTime()),
    nextJie: termPointOf(
      nextJie.getName(),
      nextJie.getJulianDay().getSolarTime()
    ),
  }

  return { effective, info }
}
