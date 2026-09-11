/**
 * 整盘核对：四张参考盘、流年与所处运限
 */

import { describe, expect, it } from "vitest"

import type { PaipanInput } from "../../birth/types"
import { ziweiPaipan } from "../chart"
import { ziweiDecadeFlow, ziweiLimitAt, ziweiYearly } from "../fortune"
import { ziweiStarText, ziweiToText } from "../text"
import type { ZiweiChart, ZiweiPalace } from "../types"

const A: PaipanInput = {
  year: 1990,
  month: 5,
  day: 3,
  hour: 12,
  minute: 30,
  gender: "male",
}
const B: PaipanInput = {
  year: 2000,
  month: 8,
  day: 16,
  hour: 4,
  minute: 0,
  gender: "female",
}
const C: PaipanInput = {
  year: 2023,
  month: 4,
  day: 6,
  hour: 12,
  minute: 0,
  gender: "male",
}
const D: PaipanInput = {
  year: 1990,
  month: 5,
  day: 3,
  hour: 23,
  minute: 30,
  gender: "male",
}

const stars = (list: ZiweiPalace["majorStars"]) =>
  list.length ? list.map(ziweiStarText).join(" ") : "无"

/** 一宫压成一行便于比对：干支｜正曜｜辅佐煞｜杂曜｜长生 博士｜大限 */
function line(chart: ZiweiChart, name: string): string {
  const p = chart.palaces.find((x) => x.name === name)!
  return [
    p.sixtyCycle + (p.isBodyPalace ? "身" : ""),
    stars(p.majorStars),
    stars(p.minorStars),
    stars(p.adjectiveStars),
    `${p.changSheng} ${p.boShi}`,
    `${p.decade.startAge}-${p.decade.endAge}`,
  ].join("｜")
}

describe("参考盘 A：1990-05-03 12:30 男，庚午年四月初九午时", () => {
  const chart = ziweiPaipan(A)

  it("命身与局", () => {
    expect(chart.lunar).toMatchObject({
      year: 1990,
      yearSixtyCycle: "庚午",
      month: 4,
      leap: false,
      day: 9,
      effectiveMonth: 4,
      hourBranch: "午",
    })
    expect(chart.yang).toBe(true)
    expect(chart.forward).toBe(true)
    expect(chart.lifePalace).toBe("亥")
    expect(chart.bodyPalace).toBe("亥")
    expect(chart.bureau).toEqual({ name: "土五局", element: "土", number: 5 })
    expect(chart.lifeMaster).toBe("破军")
    expect(chart.bodyMaster).toBe("火星")
    expect(chart.time.zodiac).toBe("马")
    expect(chart.mutations).toEqual([
      { star: "太阳", mutation: "禄" },
      { star: "武曲", mutation: "权" },
      { star: "天府", mutation: "科" },
      { star: "天同", mutation: "忌" },
    ])
    expect(chart.palaces).toHaveLength(12)
    expect(chart.palaces.map((p) => p.branch).join("")).toBe(
      "子丑寅卯辰巳午未申酉戌亥"
    )
  })

  it("十二宫", () => {
    expect(line(chart, "命宫")).toBe(
      "丁亥身｜太阳（陷）化禄｜无｜天官 天巫 劫煞 月德 八座 恩光 旬空傍｜临官 小耗｜5-14"
    )
    expect(line(chart, "兄弟宫")).toBe(
      "丙戌｜武曲（庙）化权｜文曲（陷）｜解神 龙池 华盖 旬空｜冠带 青龙｜115-124"
    )
    expect(line(chart, "夫妻宫")).toBe(
      "乙酉｜天同（平）化忌｜铃星（陷） 擎羊（陷）｜红鸾｜沐浴 力士｜105-114"
    )
    expect(line(chart, "子女宫")).toBe(
      "甲申｜七杀（庙）｜禄存（庙） 天马（旺）｜阴煞 封诰 孤辰｜长生 博士｜95-104"
    )
    expect(line(chart, "财帛宫")).toBe(
      "癸未｜天梁（旺）｜左辅（庙） 右弼（庙） 天钺（旺） 火星（闲） 陀罗（庙）｜天空 截空傍｜养 官府｜85-94"
    )
    expect(line(chart, "疾厄宫")).toBe(
      "壬午｜廉贞（平） 天相（旺）｜无｜天福 截空 天使｜胎 伏兵｜75-84"
    )
    expect(line(chart, "迁移宫")).toBe(
      "辛巳｜巨门（平）｜地空（庙） 地劫（闲）｜破碎 天才 天寿 天贵｜绝 大耗｜65-74"
    )
    expect(line(chart, "交友宫")).toBe(
      "庚辰｜贪狼（庙）｜文昌（旺）｜天姚 凤阁 寡宿 年解 天伤｜墓 病符｜55-64"
    )
    expect(line(chart, "事业宫")).toBe(
      "己卯｜太阴（陷）｜无｜天喜 咸池 天德 三台｜死 喜神｜45-54"
    )
    expect(line(chart, "田宅宫")).toBe(
      "戊寅｜紫微（庙） 天府（庙）化科｜无｜天厨 天月 蜚廉｜病 飞廉｜35-44"
    )
    expect(line(chart, "福德宫")).toBe(
      "己丑｜天机（陷）｜天魁（旺）｜大耗｜衰 奏书｜25-34"
    )
    expect(line(chart, "父母宫")).toBe(
      "戊子｜破军（庙）｜无｜天刑 台辅 天哭 天虚｜帝旺 将军｜15-24"
    )
  })

  it("大限年份与小限", () => {
    const life = chart.palaces.find((p) => p.name === "命宫")!
    expect(life.decade).toEqual({
      index: 0,
      startAge: 5,
      endAge: 14,
      startYear: 1994,
      endYear: 2003,
    })
    expect(life.minorLimitAges.slice(0, 3)).toEqual([8, 20, 32])
    expect(
      chart.palaces.find((p) => p.name === "交友宫")!.minorLimitAges.slice(0, 3)
    ).toEqual([1, 13, 25])
  })

  it("流年 2026 丙午", () => {
    const y = ziweiYearly(chart, 2026)
    expect(y).toMatchObject({
      scope: "year",
      year: 2026,
      age: 37,
      sixtyCycle: "丙午",
      lifePalace: "午",
      douJun: "酉",
      minorLimit: "辰",
    })
    expect(Object.fromEntries(y.stars.map((s) => [s.name, s.branch]))).toEqual({
      流禄: "巳",
      流羊: "午",
      流陀: "辰",
      流魁: "亥",
      流钺: "酉",
      流昌: "申",
      流曲: "午",
      流马: "申",
      年解: "辰",
    })
    expect(y.mutations.map((m) => m.star + m.mutation)).toEqual([
      "天同禄",
      "天机权",
      "文昌科",
      "廉贞忌",
    ])
    expect(y.suiQian[6]).toBe("岁建")
    expect(y.suiQian[0]).toBe("岁破")
    expect(y.jiangQian[6]).toBe("将星")
  })

  it("大限流曜与所处运限", () => {
    const flow = ziweiDecadeFlow(chart, 3)
    expect(flow).toMatchObject({
      scope: "decade",
      sixtyCycle: "戊寅",
      lifePalace: "寅",
    })
    expect(
      Object.fromEntries(flow.stars.map((s) => [s.name, s.branch]))
    ).toEqual({
      流禄: "巳",
      流羊: "午",
      流陀: "辰",
      流魁: "丑",
      流钺: "未",
      流昌: "申",
      流曲: "午",
      流马: "申",
    })
    const limit = ziweiLimitAt(chart, { year: 2026, month: 9, day: 11 })
    expect(limit.lunarYear).toBe(2026)
    expect(limit.age).toBe(37)
    expect(limit.decade).toMatchObject({ index: 3, startAge: 35, endAge: 44 })
    // 起限之前没有大限
    expect(
      ziweiLimitAt(chart, { year: 1992, month: 6, day: 1 }).decade
    ).toBeUndefined()
  })

  it("文字命盘", () => {
    const text = ziweiToText(chart)
    expect(text).toContain(
      "阳男  大限顺行  命宫 亥  身宫 亥  土五局  命主 破军  身主 火星"
    )
    expect(text).toContain("生年四化：太阳化禄  武曲化权  天府化科  天同化忌")
    expect(text).toContain("命宫 丁亥  身宫\n  正曜：太阳（陷）化禄")
    expect(text).toContain(
      "  长生 临官  博士 小耗  大限 5 到 14 岁（1994 到 2003 年）  小限 8 20 32 44 56 68 80 92 岁"
    )
  })
})

describe("参考盘 B：2000-08-16 04:00 女，庚辰年七月十七寅时，阳女逆行", () => {
  const chart = ziweiPaipan(B)

  it("命身与局，命主按年支取廉贞", () => {
    expect(chart.forward).toBe(false)
    expect(chart.lifePalace).toBe("午")
    expect(chart.bodyPalace).toBe("戌")
    expect(chart.bureau.name).toBe("木三局")
    expect(chart.lifeMaster).toBe("廉贞")
    expect(chart.bodyMaster).toBe("文昌")
  })

  it("逆行的大限与无正曜的宫", () => {
    expect(line(chart, "命宫")).toBe(
      "壬午｜紫微（庙）｜文曲（陷）｜天福 凤阁 蜚廉 年解 截空｜衰 青龙｜3-12"
    )
    expect(line(chart, "兄弟宫")).toBe(
      "辛巳｜天机（平）｜无｜天空 天喜 孤辰 劫煞｜病 小耗｜13-22"
    )
    expect(line(chart, "疾厄宫")).toBe(
      "己丑｜天同（陷）化忌 巨门（旺）｜天魁（旺） 地劫（陷）｜寡宿 破碎 天德 天伤｜胎 喜神｜53-62"
    )
    expect(line(chart, "事业宫")).toBe(
      "丙戌身｜廉贞（旺） 天府（庙）化科｜左辅（庙）｜天虚 天才｜沐浴 伏兵｜83-92"
    )
    expect(line(chart, "田宅宫")).toBe(
      "乙酉｜无｜擎羊（陷） 地空（庙）｜咸池 月德 天贵 旬空傍｜冠带 官府｜93-102"
    )
    expect(
      chart.palaces.find((p) => p.name === "命宫")!.minorLimitAges.slice(0, 3)
    ).toEqual([5, 17, 29])
  })

  it("无正曜的宫在文字里借对宫", () => {
    expect(ziweiToText(chart)).toContain(
      "田宅宫 乙酉\n  正曜：无，借对宫卯：太阳（庙）化禄 天梁（庙）"
    )
  })
})

describe("参考盘 C：2023-04-06 12:00 男，癸卯年闰二月十六午时", () => {
  const chart = ziweiPaipan(C)

  it("闰二月十六按三月起命宫", () => {
    expect(chart.lunar).toMatchObject({
      month: 2,
      leap: true,
      day: 16,
      effectiveMonth: 3,
      yearSixtyCycle: "癸卯",
    })
    expect(chart.forward).toBe(false)
    expect(chart.lifePalace).toBe("戌")
    expect(chart.bodyPalace).toBe("戌")
    expect(chart.bureau.name).toBe("水二局")
    expect(chart.lifeMaster).toBe("文曲")
    expect(chart.bodyMaster).toBe("天同")
    expect(line(chart, "命宫")).toBe(
      "壬戌身｜巨门（旺）化权｜文曲（陷）｜解神 阴煞｜胎 青龙｜2-11"
    )
    expect(line(chart, "疾厄宫")).toBe(
      "丁巳｜武曲（平） 破军（闲）化禄｜天钺（旺） 天马（平） 地空（庙） 地劫（闲）｜天福 孤辰 蜚廉 破碎 八座 旬空 天伤｜临官 喜神｜52-61"
    )
  })
})

describe("参考盘 D：1990-05-03 23:30 男，晚子时", () => {
  it("默认属当日初九，开关打开算初十", () => {
    const current = ziweiPaipan(D)
    expect(current.lunar).toMatchObject({ day: 9, hourBranch: "子" })
    expect(current.lifePalace).toBe("巳")
    expect(current.bureau.name).toBe("金四局")
    expect(line(current, "命宫")).toBe(
      "辛巳身｜廉贞（陷） 贪狼（陷）｜无｜破碎 恩光｜长生 大耗｜4-13"
    )

    const next = ziweiPaipan(D, { lateZiAsNextDay: true })
    expect(next.lunar).toMatchObject({ day: 10, hourBranch: "子" })
    expect(next.lifePalace).toBe("巳")
    expect(line(next, "命宫")).toBe(
      "辛巳身｜天机（平）｜无｜破碎｜长生 大耗｜4-13"
    )
  })
})

describe("选项与序列化", () => {
  it("resolve 忽略 undefined，maxAge 决定小限长度", () => {
    const chart = ziweiPaipan(A, { maxAge: 12, useTrueSolarTime: undefined })
    expect(chart.options).toEqual({
      useTrueSolarTime: false,
      useDaylightSaving: false,
      lateZiAsNextDay: false,
      maxAge: 12,
    })
    expect(chart.palaces.flatMap((p) => p.minorLimitAges)).toHaveLength(12)
  })

  it("真太阳时需要经度", () => {
    expect(() => ziweiPaipan(A, { useTrueSolarTime: true })).toThrow(
      "longitude"
    )
  })

  it("没有庙陷与四化的星不带这两个键", () => {
    const chart = ziweiPaipan(A)
    const json = JSON.parse(JSON.stringify(chart)) as ZiweiChart
    const hongLuan = json.palaces.find((p) => p.name === "夫妻宫")!
      .adjectiveStars[0]!
    expect(hongLuan).toEqual({ name: "红鸾" })
  })
})
