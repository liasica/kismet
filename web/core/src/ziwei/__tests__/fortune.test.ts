/**
 * 长生博士、大限小限、流曜与岁前将前
 */

import { describe, expect, it } from "vitest"

import { EARTH_BRANCHES } from "../../birth/constants"
import { branchIndex, stemIndex } from "../data/tables"
import {
  boShiOf,
  changShengOf,
  decadesOf,
  flowOf,
  jiangQianOf,
  lunarYearCycle,
  minorLimitAgesOf,
  minorLimitBranchOf,
  mutationsOf,
  suiQianOf,
} from "../fortune"

const B = (index: number) => EARTH_BRANCHES[index]

describe("十二神", () => {
  it("金四局阳男长生起巳顺行，阴男逆行", () => {
    const forward = changShengOf(4, true)
    expect(forward[branchIndex("巳")]).toBe("长生")
    expect(forward[branchIndex("午")]).toBe("沐浴")
    expect(forward[branchIndex("辰")]).toBe("养")
    const backward = changShengOf(4, false)
    expect(backward[branchIndex("巳")]).toBe("长生")
    expect(backward[branchIndex("辰")]).toBe("沐浴")
  })

  it("博士从禄存起", () => {
    const names = boShiOf(branchIndex("申"), true)
    expect(names[branchIndex("申")]).toBe("博士")
    expect(names[branchIndex("酉")]).toBe("力士")
    expect(names[branchIndex("未")]).toBe("官府")
  })

  it("岁前从太岁起，将前从三合旺地起", () => {
    const sui = suiQianOf(branchIndex("午"))
    expect(sui[branchIndex("午")]).toBe("岁建")
    expect(sui[branchIndex("子")]).toBe("岁破")
    expect(sui[branchIndex("巳")]).toBe("病符")
    const jiang = jiangQianOf(branchIndex("午"))
    expect(jiang[branchIndex("午")]).toBe("将星")
    expect(jiang[branchIndex("巳")]).toBe("亡神")
    // 申子辰年将星在子
    expect(jiangQianOf(branchIndex("辰"))[branchIndex("子")]).toBe("将星")
  })
})

describe("大限与小限", () => {
  it("书例：命宫在丑、金四局、阳男，丑宫 4 到 13，寅宫 14 到 23", () => {
    const decades = decadesOf(branchIndex("丑"), true, 4, 1984)
    expect(decades[branchIndex("丑")]).toEqual({
      index: 0,
      startAge: 4,
      endAge: 13,
      startYear: 1987,
      endYear: 1996,
    })
    expect(decades[branchIndex("寅")]).toMatchObject({
      index: 1,
      startAge: 14,
      endAge: 23,
    })
    expect(decades[branchIndex("子")]).toMatchObject({
      index: 11,
      startAge: 114,
      endAge: 123,
    })
  })

  it("逆行时第二步在兄弟宫方向", () => {
    const decades = decadesOf(branchIndex("丑"), false, 2, 1990)
    expect(decades[branchIndex("子")]).toMatchObject({ index: 1, startAge: 12 })
  })

  it("小限：寅午戌年男命一岁起辰顺行，女命逆行", () => {
    expect(B(minorLimitBranchOf(branchIndex("午"), true, 1))).toBe("辰")
    expect(B(minorLimitBranchOf(branchIndex("午"), true, 2))).toBe("巳")
    expect(B(minorLimitBranchOf(branchIndex("午"), false, 2))).toBe("卯")
    expect(B(minorLimitBranchOf(branchIndex("子"), true, 1))).toBe("戌")
    expect(B(minorLimitBranchOf(branchIndex("丑"), true, 1))).toBe("未")
    expect(B(minorLimitBranchOf(branchIndex("卯"), true, 1))).toBe("丑")
    const ages = minorLimitAgesOf(branchIndex("午"), true, 30)
    expect(ages[branchIndex("辰")]).toEqual([1, 13, 25])
    expect(ages[branchIndex("卯")]).toEqual([12, 24])
  })
})

describe("流曜", () => {
  it("四化按干", () => {
    expect(mutationsOf(stemIndex("丙"))).toEqual([
      { star: "天同", mutation: "禄" },
      { star: "天机", mutation: "权" },
      { star: "文昌", mutation: "科" },
      { star: "廉贞", mutation: "忌" },
    ])
  })

  it("书例：甲年流魁丑钺未、禄寅羊卯陀丑；丙年流禄巳羊午陀辰", () => {
    const jia = flowOf(
      "year",
      stemIndex("甲"),
      branchIndex("子"),
      branchIndex("子")
    )
    const at = (flow: typeof jia, name: string) =>
      flow.stars.find((s) => s.name === name)?.branch
    expect(at(jia, "流魁")).toBe("丑")
    expect(at(jia, "流钺")).toBe("未")
    expect(at(jia, "流禄")).toBe("寅")
    expect(at(jia, "流羊")).toBe("卯")
    expect(at(jia, "流陀")).toBe("丑")
    expect(at(jia, "流昌")).toBe("巳")
    expect(at(jia, "流曲")).toBe("酉")
    expect(at(jia, "流马")).toBe("寅")
    expect(at(jia, "年解")).toBe("戌")
    expect(jia.sixtyCycle).toBe("甲子")
    expect(jia.lifePalace).toBe("子")
    const bing = flowOf(
      "decade",
      stemIndex("丙"),
      branchIndex("寅"),
      branchIndex("寅")
    )
    expect(at(bing, "流禄")).toBe("巳")
    expect(at(bing, "流羊")).toBe("午")
    expect(at(bing, "流陀")).toBe("辰")
    expect(at(bing, "流马")).toBe("申")
    expect(bing.stars.map((s) => s.name)).not.toContain("年解")
  })

  it("农历年干支：2026 为丙午，1990 为庚午", () => {
    expect(lunarYearCycle(2026)).toEqual([stemIndex("丙"), branchIndex("午")])
    expect(lunarYearCycle(1990)).toEqual([stemIndex("庚"), branchIndex("午")])
  })
})
