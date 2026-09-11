/**
 * 农历生辰、命身宫、宫干与五行局，例题出自初级讲义
 */

import { describe, expect, it } from "vitest"
import { SolarTime } from "tyme4ts"

import { EARTH_BRANCHES, HEAVEN_STEMS } from "../../birth/constants"
import { branchIndex } from "../data/tables"
import { effectiveMonthOf, hourBranchIndex, lunarBirthOf } from "../lunar"
import {
  bodyPalaceOf,
  bureauOf,
  lifePalaceOf,
  nayinElementOf,
  palaceStemOf,
} from "../palaces"

const stem = (name: string) => HEAVEN_STEMS.indexOf(name as "甲")

describe("农历生辰", () => {
  it("时支：23 点与 0 点同为子", () => {
    expect(hourBranchIndex(0)).toBe(0)
    expect(hourBranchIndex(23)).toBe(0)
    expect(hourBranchIndex(1)).toBe(1)
    expect(hourBranchIndex(10)).toBe(5)
    expect(hourBranchIndex(22)).toBe(11)
  })

  it("闰月前半属本月，十六起属下月，闰十二月十六起作正月", () => {
    expect(effectiveMonthOf(2, false, 20)).toBe(2)
    expect(effectiveMonthOf(2, true, 15)).toBe(2)
    expect(effectiveMonthOf(2, true, 16)).toBe(3)
    expect(effectiveMonthOf(12, true, 16)).toBe(1)
  })

  it("2023 年闰二月：3 月 22 日是闰二月初一，4 月 6 日是闰二月十六", () => {
    const first = lunarBirthOf(
      SolarTime.fromYmdHms(2023, 3, 22, 12, 0, 0),
      false
    )
    expect(first).toMatchObject({
      month: 2,
      leap: true,
      day: 1,
      effectiveMonth: 2,
    })
    const sixteenth = lunarBirthOf(
      SolarTime.fromYmdHms(2023, 4, 6, 12, 0, 0),
      false
    )
    expect(sixteenth).toMatchObject({
      month: 2,
      leap: true,
      day: 16,
      effectiveMonth: 3,
    })
    expect(sixteenth.yearSixtyCycle).toBe("癸卯")
    expect(sixteenth.year).toBe(2023)
  })

  it("晚子时默认属当日，开关打开才算次日", () => {
    const t = SolarTime.fromYmdHms(1990, 5, 3, 23, 30, 0)
    expect(lunarBirthOf(t, false)).toMatchObject({
      month: 4,
      day: 9,
      hourBranchIndex: 0,
    })
    expect(lunarBirthOf(t, true)).toMatchObject({
      month: 4,
      day: 10,
      hourBranchIndex: 0,
    })
  })

  it("农历年以正月初一为界：1990-01-26 仍是己巳年", () => {
    expect(
      lunarBirthOf(SolarTime.fromYmdHms(1990, 1, 26, 12, 0, 0), false)
        .yearSixtyCycle
    ).toBe("己巳")
    expect(
      lunarBirthOf(SolarTime.fromYmdHms(1990, 1, 27, 12, 0, 0), false)
        .yearSixtyCycle
    ).toBe("庚午")
  })
})

describe("命身宫、宫干与五行局", () => {
  it("书例：三月巳时，命宫亥、身宫酉", () => {
    expect(EARTH_BRANCHES[lifePalaceOf(3, hourBranchIndex(10))]).toBe("亥")
    expect(EARTH_BRANCHES[bodyPalaceOf(3, hourBranchIndex(10))]).toBe("酉")
  })

  it("五虎遁：甲己之年丙遁寅，子丑两宫接在亥之后", () => {
    expect(HEAVEN_STEMS[palaceStemOf(stem("甲"), branchIndex("寅"))]).toBe("丙")
    expect(HEAVEN_STEMS[palaceStemOf(stem("甲"), branchIndex("丑"))]).toBe("丁")
    expect(HEAVEN_STEMS[palaceStemOf(stem("甲"), branchIndex("子"))]).toBe("丙")
    expect(HEAVEN_STEMS[palaceStemOf(stem("庚"), branchIndex("寅"))]).toBe("戊")
    expect(HEAVEN_STEMS[palaceStemOf(stem("癸"), branchIndex("亥"))]).toBe("癸")
  })

  it("纳音：书例辛卯木、丙申火，甲子金", () => {
    expect(nayinElementOf(stem("辛"), branchIndex("卯"))).toBe("木")
    expect(nayinElementOf(stem("丙"), branchIndex("申"))).toBe("火")
    expect(nayinElementOf(stem("甲"), branchIndex("子"))).toBe("金")
  })

  it("书例：乙未年命宫戊寅为土五局", () => {
    expect(bureauOf(stem("戊"), branchIndex("寅"))).toEqual({
      name: "土五局",
      element: "土",
      number: 5,
    })
  })
})
