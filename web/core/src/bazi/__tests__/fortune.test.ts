/**
 * 大运、流年、小运与起运测试
 */

import { describe, expect, it } from "vitest"
import { SixtyCycle } from "tyme4ts"

import { baziPaipan } from "../chart"
import {
  buildFortuneMonths,
  buildPreFortuneYears,
  minorFortuneOf,
} from "../fortune"
import { HeavenStem } from "tyme4ts"
import type { Gender, PaipanInput } from "../../birth/types"

function at(year: number, gender: Gender): PaipanInput {
  return { year, month: 5, day: 3, hour: 12, minute: 30, gender }
}

describe("测试 6：大运顺逆与起运", () => {
  /**
   * 四组方向：阳年男与阴年女顺排、阴年男与阳年女逆排
   *
   * 1990 是庚午年，庚为阳；1991 是辛未年，辛为阴
   */
  const cases = [
    {
      label: "阳男",
      year: 1990,
      gender: "male" as const,
      forward: true,
      first: "辛巳",
      startYear: 1991,
    },
    {
      label: "阴男",
      year: 1991,
      gender: "male" as const,
      forward: false,
      first: "辛卯",
      startYear: 2000,
    },
    {
      label: "阳女",
      year: 1990,
      gender: "female" as const,
      forward: false,
      first: "己卯",
      startYear: 1999,
    },
    {
      label: "阴女",
      year: 1991,
      gender: "female" as const,
      forward: true,
      first: "癸巳",
      startYear: 1992,
    },
  ]

  for (const c of cases) {
    it(`${c.label}（${c.year} 年生）${c.forward ? "顺" : "逆"}排，首步大运 ${c.first}`, () => {
      const chart = baziPaipan(at(c.year, c.gender))
      expect(chart.qiYun.forward).toBe(c.forward)
      expect(chart.decades[0].sixtyCycle).toBe(c.first)
      expect(chart.decades[0].startYear).toBe(c.startYear)

      // 大运干支从月柱起步，每步走一位
      const month = SixtyCycle.fromName(chart.pillars.month.sixtyCycle)
      for (const [i, d] of chart.decades.entries()) {
        expect(d.sixtyCycle, `第 ${i + 1} 步大运`).toBe(
          month.next(c.forward ? i + 1 : -i - 1).getName()
        )
      }
    })

    it(`${c.label}顺排取下一个节、逆排取上一个节作为折算依据`, () => {
      const chart = baziPaipan(at(c.year, c.gender))
      // 5 月 3 日在清明与立夏之间，顺排数到立夏、逆排数到清明
      expect(chart.qiYun.term.name).toBe(c.forward ? "立夏" : "清明")
    })
  }

  /**
   * 起运的期望值与问真八字排盘逐位核对过
   *
   * 核对条件：1990-05-03 12:30，东经 114.0833，男，
   * 开启真太阳时（问真给出的真太阳时为 12:09），起运折算精度取到时辰。
   * 问真原文「出生后0年10月12天4时起运」「交运：逢辛、丙年 惊蛰后9天 交大运」，
   * 大运首步「1991 2岁 辛巳」，与下面的断言完全一致
   */
  it("与问真核对过的起运值", () => {
    const chart = baziPaipan(
      {
        year: 1990,
        month: 5,
        day: 3,
        hour: 12,
        minute: 30,
        gender: "male",
        longitude: 114.0833,
      },
      { useTrueSolarTime: true, qiYunPrecision: "hour" }
    )
    expect(chart.time.effective).toBe("1990-05-03 12:09:00")
    expect([
      chart.qiYun.yearCount,
      chart.qiYun.monthCount,
      chart.qiYun.dayCount,
      chart.qiYun.hourCount,
    ]).toEqual([0, 10, 12, 4])
    // 交运时刻落在 1991 年惊蛰后 9 天
    expect(chart.qiYun.startTime.slice(0, 10)).toBe("1991-03-15")
    expect(chart.qiYun.startAge).toBe(2)
  })

  it("折算精度 day 比 hour 少折一位时辰", () => {
    const input: PaipanInput = {
      year: 1990,
      month: 5,
      day: 3,
      hour: 12,
      minute: 30,
      gender: "male",
      longitude: 114.0833,
    }
    const byDay = baziPaipan(input, {
      useTrueSolarTime: true,
      qiYunPrecision: "day",
    })
    const byHour = baziPaipan(input, {
      useTrueSolarTime: true,
      qiYunPrecision: "hour",
    })
    expect(byDay.qiYun.hourCount).toBe(0)
    expect(byHour.qiYun.hourCount).toBe(4)
    // 年月日三位一致，只差时辰位
    expect([
      byDay.qiYun.yearCount,
      byDay.qiYun.monthCount,
      byDay.qiYun.dayCount,
    ]).toEqual([
      byHour.qiYun.yearCount,
      byHour.qiYun.monthCount,
      byHour.qiYun.dayCount,
    ])
    expect(byDay.qiYun.text).not.toContain("时")
    expect(byHour.qiYun.text).toContain("时")
  })
})

describe("流年与小运", () => {
  const chart = baziPaipan(
    {
      year: 1990,
      month: 5,
      day: 3,
      hour: 12,
      minute: 30,
      gender: "male",
      longitude: 114.0833,
    },
    { useTrueSolarTime: true, qiYunPrecision: "hour" }
  )

  it("流年虚岁与公历年一一对应", () => {
    for (const d of chart.decades) {
      for (const y of d.years) {
        expect(y.age, `${y.year} 年的虚岁`).toBe(y.year - 1990 + 1)
      }
    }
  })

  it("流年干支取自干支纪年", () => {
    const y2021 = chart.decades
      .flatMap((d) => d.years)
      .find((y) => y.year === 2021)
    expect(y2021?.sixtyCycle).toBe("辛丑")
    expect(y2021?.age).toBe(32)
    // 问真在 2021 年那格给出的小运是庚寅
    expect(y2021?.minorFortune).toBe("庚寅")
  })

  it("小运从时柱起步，按虚岁逐年走一位", () => {
    const hour = SixtyCycle.fromName(chart.pillars.hour.sixtyCycle)
    for (const age of [1, 2, 32, 60]) {
      expect(minorFortuneOf(hour, age, true).getName()).toBe(
        hour.next(age).getName()
      )
    }
  })

  it("流年输出到 maxAge 为止", () => {
    const ages = chart.decades.flatMap((d) => d.years).map((y) => y.age)
    expect(Math.max(...ages)).toBe(100)
    expect(ages).toContain(chart.qiYun.startAge)
  })

  it("起运之前只有小运", () => {
    const pre = buildPreFortuneYears(
      1990,
      chart.qiYun.startAge,
      SixtyCycle.fromName(chart.pillars.hour.sixtyCycle),
      HeavenStem.fromName(chart.dayStem),
      chart.qiYun.forward
    )
    // 起运虚岁是 2，所以起运前只有 1 岁那一年
    expect(pre).toHaveLength(1)
    expect(pre[0]).toMatchObject({ year: 1990, age: 1, minorFortune: "己未" })
  })
})

describe("流月以节为界", () => {
  it("2026 丙午年的十二个流月由庚寅起", () => {
    const months = buildFortuneMonths(2026, HeavenStem.fromName("戊"))
    expect(months).toHaveLength(12)
    // 问真在 2026 流月表给出的头三格是 立春 2/4 庚寅、惊蛰 3/5 辛卯、清明 4/5 壬辰
    expect(months[0]).toMatchObject({ termName: "立春", sixtyCycle: "庚寅" })
    expect(months[1]).toMatchObject({ termName: "惊蛰", sixtyCycle: "辛卯" })
    expect(months[2]).toMatchObject({ termName: "清明", sixtyCycle: "壬辰" })
    expect(months[0].termTime.slice(0, 10)).toBe("2026-02-04")
  })

  it("十二个流月的节名依次是十二节，干支连续", () => {
    const months = buildFortuneMonths(2024, HeavenStem.fromName("甲"))
    expect(months.map((m) => m.termName)).toEqual([
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
    ])
    for (let i = 1; i < months.length; i++) {
      expect(months[i].sixtyCycle).toBe(
        SixtyCycle.fromName(months[i - 1].sixtyCycle)
          .next(1)
          .getName()
      )
    }
  })
})

describe("胎元与命宫", () => {
  it("胎元是月干进一位、月支进三位", () => {
    const chart = baziPaipan({
      year: 1990,
      month: 5,
      day: 3,
      hour: 12,
      minute: 30,
      gender: "male",
    })
    const month = SixtyCycle.fromName(chart.pillars.month.sixtyCycle)
    expect(chart.extras.fetalOrigin).toBe(
      month.getHeavenStem().next(1).getName() +
        month.getEarthBranch().next(3).getName()
    )
  })

  it("与问真核对：胎元辛未、命宫癸未、身宫丁亥", () => {
    const chart = baziPaipan({
      year: 1990,
      month: 5,
      day: 3,
      hour: 12,
      minute: 30,
      gender: "male",
    })
    expect(chart.extras).toMatchObject({
      fetalOrigin: "辛未",
      ownSign: "癸未",
      bodySign: "丁亥",
    })
  })
})
