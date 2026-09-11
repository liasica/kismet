/**
 * 查表数据与庙陷表的核对，基准是《中州派紫微斗数初级讲义》的安星简表
 */

import { describe, expect, it } from "vitest"

import { EARTH_BRANCHES } from "../../birth/constants"
import { brightnessOf } from "../data/brightness"
import {
  ADJECTIVE_STARS,
  BO_SHI,
  branchIndex,
  CHANG_SHENG,
  JIANG_QIAN,
  LU_CUN,
  MAJOR_STARS,
  MINOR_STARS,
  mod,
  MUTATION_TABLE,
  SUI_QIAN,
  TIAN_KUI,
  TIAN_YUE,
} from "../data/tables"

describe("查表数据", () => {
  it("星曜清单数量", () => {
    expect(MAJOR_STARS).toHaveLength(14)
    expect(MINOR_STARS).toHaveLength(14)
    expect(ADJECTIVE_STARS).toHaveLength(41)
    expect(CHANG_SHENG).toHaveLength(12)
    expect(BO_SHI).toHaveLength(12)
    expect(SUI_QIAN).toHaveLength(12)
    expect(JIANG_QIAN).toHaveLength(12)
  })

  it("mod 与 branchIndex", () => {
    expect(mod(-1, 12)).toBe(11)
    expect(mod(13, 12)).toBe(1)
    expect(branchIndex("亥")).toBe(11)
  })

  it("禄存、魁钺按年干", () => {
    // 甲禄到寅宫 乙禄居卯府 丙戊禄在巳 丁己禄在午 庚禄定居申 辛禄酉上补 壬禄亥中藏 癸禄居子户
    expect(LU_CUN.map((b) => EARTH_BRANCHES[b]).join("")).toBe("寅卯巳午巳午申酉亥子")
    // 甲戊庚牛羊 乙己鼠猴乡 丙丁猪鸡位 壬癸兔蛇藏 六辛逢马虎
    expect(TIAN_KUI.map((b) => EARTH_BRANCHES[b]).join("")).toBe("丑子亥亥丑子丑午卯卯")
    expect(TIAN_YUE.map((b) => EARTH_BRANCHES[b]).join("")).toBe("未申酉酉未申未寅巳巳")
  })

  it("中州派四化表", () => {
    // 甲廉破武阳 乙机梁紫阴 丙同机昌廉 丁阴同机巨 戊贪阴阳机 己武贪梁曲 庚阳武府同 辛巨阳曲昌 壬梁紫府武 癸破巨阴贪
    expect(MUTATION_TABLE[4]).toEqual(["贪狼", "太阴", "太阳", "天机"])
    expect(MUTATION_TABLE[6]).toEqual(["太阳", "武曲", "天府", "天同"])
    expect(MUTATION_TABLE[8]).toEqual(["天梁", "紫微", "天府", "武曲"])
    expect(MUTATION_TABLE[0]).toEqual(["廉贞", "破军", "武曲", "太阳"])
    expect(MUTATION_TABLE[9]).toEqual(["破军", "巨门", "太阴", "贪狼"])
  })
})

describe("庙陷总表", () => {
  it("十四正曜整行", () => {
    const row = (star: string) =>
      EARTH_BRANCHES.map((_, b) => brightnessOf(star, b) ?? "-").join("")
    expect(row("紫微")).toBe("平庙庙旺陷旺庙庙旺平闲旺")
    expect(row("贪狼")).toBe("旺庙平地庙陷旺庙平平庙陷")
    expect(row("天梁")).toBe("庙旺庙庙旺陷庙旺陷地旺陷")
    expect(row("破军")).toBe("庙旺陷旺旺闲庙庙陷陷旺平")
  })

  it("擎羊陀罗只落在能到的宫", () => {
    // 擎羊在禄存前一宫，禄存只在寅卯巳午申酉亥子，所以擎羊不到寅巳申亥
    expect(brightnessOf("擎羊", branchIndex("寅"))).toBeUndefined()
    expect(brightnessOf("擎羊", branchIndex("午"))).toBe("平")
    expect(brightnessOf("陀罗", branchIndex("子"))).toBeUndefined()
    expect(brightnessOf("陀罗", branchIndex("丑"))).toBe("庙")
  })

  it("辅佐与杂曜", () => {
    expect(brightnessOf("天魁", branchIndex("卯"))).toBe("庙")
    expect(brightnessOf("天钺", branchIndex("申"))).toBe("庙")
    expect(brightnessOf("天马", branchIndex("巳"))).toBe("平")
    expect(brightnessOf("禄存", branchIndex("丑"))).toBeUndefined()
    // 杂曜不标庙陷
    expect(brightnessOf("红鸾", branchIndex("卯"))).toBeUndefined()
  })
})
