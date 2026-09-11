/**
 * 时间校正测试：真太阳时、均时差、夏令时
 */

import { describe, expect, it } from "vitest"

import { baziPaipan } from "../chart"
import { isInChinaDst } from "../../birth/daylight-saving"
import {
  equationOfTime,
  trueSolarOffsetMinutes,
} from "../../birth/equation-of-time"
import type { PaipanInput } from "../../birth/types"

/** 乌鲁木齐一带的经度 */
const URUMQI_LNG = 87.6

/** 问真基准盘的经度 */
const BASELINE_LNG = 114.0833

function male(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  longitude?: number
): PaipanInput {
  return { year, month, day, hour, minute, gender: "male", longitude }
}

describe("测试 5：真太阳时改变时柱", () => {
  it("乌鲁木齐 22:55 出生，开启真太阳时后时支由亥退到戌", () => {
    const input = male(1990, 5, 3, 22, 55, URUMQI_LNG)
    const off = baziPaipan(input, { useTrueSolarTime: false })
    const on = baziPaipan(input, { useTrueSolarTime: true })

    expect(off.time.effective).toBe("1990-05-03 22:55:00")
    expect(off.pillars.hour.sixtyCycle).toBe("癸亥")

    // 经度差 (87.6 - 120) x 4 = -129.6 分，均时差约 +3 分，合计约退 2 小时 6 分
    expect(on.time.longitudeMinutes).toBeCloseTo(-129.6, 1)
    expect(on.time.equationOfTimeMinutes).toBeGreaterThan(2)
    expect(on.time.equationOfTimeMinutes).toBeLessThan(4)
    expect(on.time.effective).toBe("1990-05-03 20:49:00")
    expect(on.pillars.hour.sixtyCycle).toBe("壬戌")

    // 只有时柱变，日柱与年月柱不动
    expect(on.pillars.day.sixtyCycle).toBe(off.pillars.day.sixtyCycle)
    expect(on.pillars.year.sixtyCycle).toBe(off.pillars.year.sixtyCycle)
    expect(on.pillars.month.sixtyCycle).toBe(off.pillars.month.sixtyCycle)
  })

  it("真太阳时可以把时刻推到前一天，日柱与时柱一起变", () => {
    // 四川广安 1904-08-22 00:30，经度约 105.94，退约 56 分钟到前一天 23:34
    const input = male(1904, 8, 22, 0, 30, 105.94)
    const off = baziPaipan(input, { useTrueSolarTime: false })
    const on = baziPaipan(input, { useTrueSolarTime: true })

    expect(off.pillars.day.sixtyCycle).toBe("戊子")
    expect(off.pillars.hour.sixtyCycle).toBe("壬子")

    expect(on.time.effective.slice(0, 10)).toBe("1904-08-21")
    // 退到 23 点后仍是子时，按默认的晚子时算当天，日柱用 8 月 21 日的丁亥
    expect(on.pillars.day.sixtyCycle).toBe("丁亥")
    expect(on.pillars.hour.sixtyCycle).toBe("庚子")
  })

  it("未提供经度时开启真太阳时会报错，不做静默降级", () => {
    expect(() =>
      baziPaipan(male(1990, 5, 3, 12, 30), { useTrueSolarTime: true })
    ).toThrow(/经度/)
  })
})

describe("均时差", () => {
  it("基准盘的真太阳时落在 12:09，与问真八字一致", () => {
    const chart = baziPaipan(male(1990, 5, 3, 12, 30, BASELINE_LNG), {
      useTrueSolarTime: true,
    })
    expect(chart.time.effective).toBe("1990-05-03 12:09:00")
  })

  it("全年取值落在 -15 到 +17 分钟之间", () => {
    for (let d = 0; d < 366; d++) {
      const date = new Date(Date.UTC(2024, 0, 1 + d))
      const v = equationOfTime(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate()
      )
      expect(v, `2024 年第 ${d + 1} 天`).toBeGreaterThan(-15)
      expect(v, `2024 年第 ${d + 1} 天`).toBeLessThan(17)
    }
  })

  it("四个极值点的量级与天文年历吻合", () => {
    // 2 月中旬极小约 -14.2 分，5 月中旬极大约 +3.7 分
    expect(equationOfTime(2024, 2, 11)).toBeLessThan(-14)
    expect(equationOfTime(2024, 5, 14)).toBeGreaterThan(3.5)
    // 7 月末极小约 -6.5 分，11 月初极大约 +16.4 分
    expect(equationOfTime(2024, 7, 26)).toBeLessThan(-6)
    expect(equationOfTime(2024, 11, 3)).toBeGreaterThan(16)
  })

  it("总偏移等于经度差加均时差", () => {
    const total = trueSolarOffsetMinutes(1990, 5, 3, 12, 30, BASELINE_LNG)
    const lng = (BASELINE_LNG - 120) * 4
    expect(total - lng).toBeCloseTo(equationOfTime(1990, 5, 3, 4, 30), 1)
  })
})

describe("夏令时", () => {
  it("1990 年夏令时区间的判定", () => {
    expect(isInChinaDst(1990, 4, 15, 2, 59)).toBe(false)
    expect(isInChinaDst(1990, 4, 15, 3, 0)).toBe(true)
    expect(isInChinaDst(1990, 9, 16, 1, 59)).toBe(true)
    expect(isInChinaDst(1990, 9, 16, 2, 0)).toBe(false)
  })

  it("1992 年起不再有夏令时", () => {
    expect(isInChinaDst(1992, 6, 1, 12, 0)).toBe(false)
    expect(isInChinaDst(1985, 6, 1, 12, 0)).toBe(false)
  })

  it("开启夏令时后时刻回拨一小时，可以改变时柱", () => {
    // 1990-05-03 落在夏令时区间内，12:30 的钟表读数对应标准时 11:30
    const input = male(1990, 5, 3, 12, 30)
    const off = baziPaipan(input, { useDaylightSaving: false })
    const on = baziPaipan(input, { useDaylightSaving: true })

    expect(off.time.standard).toBe("1990-05-03 12:30:00")
    expect(on.time.standard).toBe("1990-05-03 11:30:00")
    expect(on.time.daylightSavingMinutes).toBe(-60)
    // 11:30 与 12:30 同在午时，四柱不变
    expect(on.pillars.hour.sixtyCycle).toBe(off.pillars.hour.sixtyCycle)

    // 13:30 回拨后落到 12:30，仍是午时；11:30 回拨后落到 10:30，退到巳时
    const noon = baziPaipan(male(1990, 5, 3, 11, 30), {
      useDaylightSaving: true,
    })
    expect(noon.time.standard).toBe("1990-05-03 10:30:00")
    expect(noon.pillars.hour.branch).toBe("巳")
  })

  it("夏令时区间外开启开关不产生任何偏移", () => {
    const chart = baziPaipan(male(1990, 3, 3, 12, 30), {
      useDaylightSaving: true,
    })
    expect(chart.time.daylightSavingMinutes).toBe(0)
    expect(chart.time.standard).toBe(chart.time.input)
  })

  it("夏令时与真太阳时叠加时，先回拨再算经度差与均时差", () => {
    const chart = baziPaipan(male(1990, 5, 3, 12, 30, BASELINE_LNG), {
      useDaylightSaving: true,
      useTrueSolarTime: true,
    })
    expect(chart.time.standard).toBe("1990-05-03 11:30:00")
    expect(chart.time.effective).toBe("1990-05-03 11:09:00")
  })
})
