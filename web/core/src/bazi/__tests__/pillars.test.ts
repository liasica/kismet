/**
 * 四柱与时间口径的边界测试
 *
 * 交节时刻一律由 `tyme4ts` 计算取得，不手写日期
 */

import { describe, expect, it } from "vitest"
import {
  EarthBranch,
  HeavenStem,
  SixtyCycle,
  SolarDay,
  SolarTerm,
  SolarTime,
} from "tyme4ts"

import { paipan } from "../chart"
import { hourStemOf, monthStemOf } from "../pillars"
import type { PaipanInput, PillarKind } from "../types"

const KS: readonly PillarKind[] = ["year", "month", "day", "hour"]

function pillarsOf(input: PaipanInput, lateZiAsNextDay = false): string[] {
  const chart = paipan(input, { lateZiAsNextDay })
  return KS.map((k) => chart.pillars[k].sixtyCycle)
}

function male(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): PaipanInput {
  return { year, month, day, hour, minute, gender: "male" }
}

/** 交节时刻前后各一分钟，都截到分钟位 */
function around(term: SolarTerm): { before: SolarTime; after: SolarTime } {
  const t = term.getJulianDay().getSolarTime()
  const trunc = (x: SolarTime) =>
    SolarTime.fromYmdHms(
      x.getYear(),
      x.getMonth(),
      x.getDay(),
      x.getHour(),
      x.getMinute(),
      0
    )
  return { before: trunc(t.next(-60)), after: trunc(t.next(60)) }
}

describe("测试 1：日柱基准", () => {
  it("1949-10-01 的日柱是甲子", () => {
    const chart = paipan(male(1949, 10, 1, 12, 0))
    expect(chart.pillars.day.sixtyCycle).toBe("甲子")
  })

  it("`(JDN + 49) % 60` 公式与库的日柱在连续 400 天上一致", () => {
    let day = SolarDay.fromYmd(1949, 10, 1)
    for (let i = 0; i < 400; i++) {
      const jdn = Math.floor(day.getJulianDay().getDay() + 0.5)
      const expected = SixtyCycle.fromIndex((jdn + 49) % 60).getName()
      const actual = day.getSixtyCycleDay().getSixtyCycle().getName()
      expect(actual, `${day.toString()} 的日柱`).toBe(expected)
      day = day.next(1)
    }
  })
})

describe("测试 2：年柱以立春交节为界", () => {
  for (const year of [1990, 2000, 2024]) {
    it(`${year} 年立春前后一分钟，年柱与月柱同时切换`, () => {
      const term = SolarTerm.fromName(year, "立春")
      const { before, after } = around(term)

      const b = paipan(
        male(
          before.getYear(),
          before.getMonth(),
          before.getDay(),
          before.getHour(),
          before.getMinute()
        )
      )
      const a = paipan(
        male(
          after.getYear(),
          after.getMonth(),
          after.getDay(),
          after.getHour(),
          after.getMinute()
        )
      )

      // 立春前属前一年，前后两个年柱在六十甲子里正好相邻
      expect(
        b.pillars.year.sixtyCycle,
        `${year} 立春前的年柱应是立春后年柱的前一位`
      ).toBe(SixtyCycle.fromName(a.pillars.year.sixtyCycle).next(-1).getName())

      // 立春后起寅月，立春前是上一年的丑月
      expect(a.pillars.month.branch).toBe("寅")
      expect(b.pillars.month.branch).toBe("丑")

      // 同一天之内日柱不受影响
      if (before.getDay() === after.getDay()) {
        expect(b.pillars.day.sixtyCycle).toBe(a.pillars.day.sixtyCycle)
      }
    })
  }
})

describe("测试 3：月柱以十二节为界", () => {
  for (const [year, name, branchBefore, branchAfter] of [
    [1990, "清明", "卯", "辰"],
    [2000, "立秋", "未", "申"],
    [2024, "大雪", "亥", "子"],
  ] as const) {
    it(`${year} 年${name}前后一分钟，月支由${branchBefore}转${branchAfter}`, () => {
      const { before, after } = around(SolarTerm.fromName(year, name))
      const b = paipan(
        male(
          before.getYear(),
          before.getMonth(),
          before.getDay(),
          before.getHour(),
          before.getMinute()
        )
      )
      const a = paipan(
        male(
          after.getYear(),
          after.getMonth(),
          after.getDay(),
          after.getHour(),
          after.getMinute()
        )
      )
      expect(b.pillars.month.branch).toBe(branchBefore)
      expect(a.pillars.month.branch).toBe(branchAfter)
      // 月柱整体进一位，月干跟着月支走
      expect(a.pillars.month.sixtyCycle).toBe(
        SixtyCycle.fromName(b.pillars.month.sixtyCycle).next(1).getName()
      )
    })
  }
})

describe("测试 4：早晚子时", () => {
  // 1990-05-03 日柱戊辰，1990-05-04 日柱己巳
  const table = [
    {
      at: [1990, 5, 3, 22, 59],
      early: ["戊辰", "癸亥"],
      late: ["戊辰", "癸亥"],
    },
    {
      at: [1990, 5, 3, 23, 0],
      early: ["戊辰", "壬子"],
      late: ["己巳", "甲子"],
    },
    {
      at: [1990, 5, 3, 23, 59],
      early: ["戊辰", "壬子"],
      late: ["己巳", "甲子"],
    },
    { at: [1990, 5, 4, 0, 0], early: ["己巳", "甲子"], late: ["己巳", "甲子"] },
    {
      at: [1990, 5, 4, 0, 59],
      early: ["己巳", "甲子"],
      late: ["己巳", "甲子"],
    },
    { at: [1990, 5, 4, 1, 0], early: ["己巳", "乙丑"], late: ["己巳", "乙丑"] },
  ] as const

  for (const row of table) {
    const [y, m, d, h, mi] = row.at
    const label = `${y}-${m}-${d} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`

    it(`${label} 晚子时算当天：日柱 ${row.early[0]}、时柱 ${row.early[1]}`, () => {
      const [day, hour] = pillarsOf(male(y, m, d, h, mi), false).slice(2)
      expect([day, hour]).toEqual([row.early[0], row.early[1]])
    })

    it(`${label} 晚子时算次日：日柱 ${row.late[0]}、时柱 ${row.late[1]}`, () => {
      const [day, hour] = pillarsOf(male(y, m, d, h, mi), true).slice(2)
      expect([day, hour]).toEqual([row.late[0], row.late[1]])
    })
  }

  it("晚子时两派的时干各自跟随所用的那个日干", () => {
    const early = paipan(male(1990, 5, 3, 23, 30), { lateZiAsNextDay: false })
    const late = paipan(male(1990, 5, 3, 23, 30), { lateZiAsNextDay: true })
    for (const chart of [early, late]) {
      expect(chart.pillars.hour.branch).toBe("子")
      expect(chart.pillars.hour.stem).toBe(
        hourStemOf(
          HeavenStem.fromName(chart.pillars.day.stem),
          EarthBranch.fromName("子")
        ).getName()
      )
    }
  })

  it("年柱与月柱不受早晚子时影响", () => {
    const early = paipan(male(1990, 5, 3, 23, 30), { lateZiAsNextDay: false })
    const late = paipan(male(1990, 5, 3, 23, 30), { lateZiAsNextDay: true })
    expect(early.pillars.year.sixtyCycle).toBe(late.pillars.year.sixtyCycle)
    expect(early.pillars.month.sixtyCycle).toBe(late.pillars.month.sixtyCycle)
  })
})

describe("五虎遁与五鼠遁公式与库的排法一致", () => {
  it("五鼠遁覆盖 10 日干 x 12 时支", () => {
    for (let d = 0; d < 10; d++) {
      for (let b = 0; b < 12; b++) {
        const stem = hourStemOf(
          HeavenStem.fromIndex(d),
          EarthBranch.fromIndex(b)
        )
        expect(stem.getIndex()).toBe(((d % 5) * 2 + b) % 10)
      }
    }
  })

  it("五虎遁推出的月干与库的月柱一致", () => {
    // 逐年取十二节后一分钟，比对公式月干与库给的月柱
    for (const year of [1984, 1990, 2000, 2024]) {
      for (let i = 0; i < 12; i++) {
        const term = SolarTerm.fromIndex(year, 3 + i * 2)
        const { after } = around(term)
        const chart = paipan(
          male(
            after.getYear(),
            after.getMonth(),
            after.getDay(),
            after.getHour(),
            after.getMinute()
          )
        )
        const expected = monthStemOf(
          HeavenStem.fromName(chart.pillars.year.stem),
          i
        )
        expect(
          chart.pillars.month.stem,
          `${year} 年第 ${i + 1} 节 ${term.getName()} 的月干`
        ).toBe(expected.getName())
      }
    }
  })
})
