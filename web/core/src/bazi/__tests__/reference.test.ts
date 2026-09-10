/**
 * 测试 8：与现有排盘工具的逐柱核对
 *
 * ## 核对来源
 *
 * 第一组「问真基准盘」逐项核对过问真八字排盘（https://pcbz.iwzwh.com）的
 * 基本排盘与专业细盘两页，核对项目与结论列在 `src/lib/bazi/README.md`
 * 的「与问真八字的核对」一节，一致与不一致的项都写在那里。
 *
 * 第二组是五个公开流传的生日，取值覆盖不同的排盘边界：跨年前后、真太阳时
 * 跨日、子时、月令交界。期望值来自本模块，与 `tyme4ts` 的 `SixtyCycleHour`
 * 和 `ChildLimit` 交叉一致，作用是把这些边界锁成回归锚点。这些人物的出生
 * 时辰本身在史料上并不确定，只有日期是公开的，测试断言的是排盘逻辑而不是
 * 史实。
 */

import { describe, expect, it } from "vitest"

import { paipan } from "../chart"
import type { PaipanInput, PillarKind } from "../types"

const KS: readonly PillarKind[] = ["year", "month", "day", "hour"]

function four(
  input: PaipanInput,
  partial?: Parameters<typeof paipan>[1]
): string {
  const chart = paipan(input, partial)
  return KS.map((k) => chart.pillars[k].sixtyCycle).join(" ")
}

describe("问真基准盘：1990-05-03 12:30 东经 114.0833，男", () => {
  const input: PaipanInput = {
    year: 1990,
    month: 5,
    day: 3,
    hour: 12,
    minute: 30,
    gender: "male",
    longitude: 114.0833,
  }
  const chart = paipan(input, {
    useTrueSolarTime: true,
    qiYunPrecision: "hour",
  })

  it("真太阳时 12:09，与问真给出的一致", () => {
    expect(chart.time.effective).toBe("1990-05-03 12:09:00")
    expect(chart.time.lunar).toBe("农历庚午年四月初九")
  })

  it("四柱与主星", () => {
    expect(KS.map((k) => chart.pillars[k].sixtyCycle)).toEqual([
      "庚午",
      "庚辰",
      "戊辰",
      "戊午",
    ])
    expect(KS.map((k) => chart.pillars[k].stemTenStar)).toEqual([
      "食神",
      "食神",
      "日主",
      "比肩",
    ])
  })

  it("藏干与副星", () => {
    expect(
      KS.map((k) => chart.pillars[k].hideStems.map((h) => h.stem).join(""))
    ).toEqual(["丁己", "戊乙癸", "戊乙癸", "丁己"])
    expect(
      KS.map((k) => chart.pillars[k].hideStems.map((h) => h.tenStar).join(","))
    ).toEqual(["正印,劫财", "比肩,正官,正财", "比肩,正官,正财", "正印,劫财"])
  })

  it("星运、自坐、空亡、纳音", () => {
    expect(KS.map((k) => chart.pillars[k].terrain)).toEqual([
      "帝旺",
      "冠带",
      "冠带",
      "帝旺",
    ])
    expect(KS.map((k) => chart.pillars[k].selfTerrain)).toEqual([
      "沐浴",
      "养",
      "冠带",
      "帝旺",
    ])
    expect(KS.map((k) => chart.pillars[k].extraBranches.join(""))).toEqual([
      "戌亥",
      "申酉",
      "戌亥",
      "子丑",
    ])
    expect(KS.map((k) => chart.pillars[k].sound)).toEqual([
      "路旁土",
      "白蜡金",
      "大林木",
      "天上火",
    ])
  })

  it("胎元、命宫、身宫", () => {
    expect(chart.extras).toMatchObject({
      fetalOrigin: "辛未",
      ownSign: "癸未",
      bodySign: "丁亥",
    })
  })

  it("起运与大运十步", () => {
    expect(chart.qiYun.text).toBe("出生后 0 年 10 月 12 天 4 时 起运")
    expect(chart.decades.map((d) => d.sixtyCycle)).toEqual([
      "辛巳",
      "壬午",
      "癸未",
      "甲申",
      "乙酉",
      "丙戌",
      "丁亥",
      "戊子",
      "己丑",
      "庚寅",
    ])
    expect(chart.decades.map((d) => d.startYear)).toEqual([
      1991, 2001, 2011, 2021, 2031, 2041, 2051, 2061, 2071, 2081,
    ])
    expect(chart.decades[0].startAge).toBe(2)
  })

  it("月令旺相休囚死", () => {
    expect(chart.elements.seasonalState).toEqual({
      wood: "囚",
      fire: "休",
      earth: "旺",
      metal: "相",
      water: "死",
    })
  })
})

describe("五个公开生日：与问真逐柱核对", () => {
  /**
   * 核对口径
   *
   * 问真的四柱与起运都按真太阳时排，北京时只用于显示，它页面上那个「真太阳时」
   * 开关不参与排盘；默认设置下 23 点即换日，相当于本模块 `lateZiAsNextDay: true`。
   * 所以下面统一用 `useTrueSolarTime: true`、`lateZiAsNextDay: true`、
   * `qiYunPrecision: "hour"` 去对，经度取本项目区划数据里该区县的值。
   *
   * ## 核对结果
   *
   * | 例 | 真太阳时 | 四柱 | 起运 | 首运 | 胎元 | 命宫 | 身宫 |
   * | --- | --- | --- | --- | --- | --- | --- | --- |
   * | 1 韶山市 | 差 36 秒 | 时柱不同 | 差 2 时 | 一致 | 一致 | 不同 | 不同 |
   * | 2 奉化区 | 一致 | 一致 | 一致 | 一致 | 一致 | 一致 | 一致 |
   * | 3 淮安区 | 一致 | 一致 | 差 1 时 | 一致 | 一致 | 一致 | 一致 |
   * | 4 广安区 | 一致 | 一致 | 差 1 时 | 一致 | 一致 | 一致 | 一致 |
   * | 5 东城区 | 一致 | 一致 | 一致 | 一致 | 一致 | 一致 | 一致 |
   *
   * 起运表里 1 时折合 1 分钟实际时长，例 3、4 的 1 时之差来自节气交节时刻的
   * 分钟级差异。例 1 是唯一的实质差异：本模块算出真太阳时 06:59:24，问真给
   * 07:00，两者相差 36 秒而 07:00 正是卯辰交界，时柱因此从癸卯变甲辰，命宫与
   * 身宫跟着变。本模块的均时差对 JPL Horizons DE441 逐日误差不超过 0.6 秒，
   * 06:59:24 是更接近真值的一侧。
   *
   * 这些人物的出生时辰在史料上并不确定，只有日期是公开的，断言的是排盘逻辑
   * 而不是史实。
   */
  const WZ_OPTIONS = {
    useTrueSolarTime: true,
    lateZiAsNextDay: true,
    qiYunPrecision: "hour",
  } as const

  function chartOf(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    longitude: number
  ) {
    return paipan(
      { year, month, day, hour, minute, gender: "male", longitude },
      WZ_OPTIONS
    )
  }

  function qiYunText(chart: ReturnType<typeof chartOf>): string {
    const q = chart.qiYun
    return `${q.yearCount}年${q.monthCount}月${q.dayCount}天${q.hourCount}时`
  }

  /** 湖南省湘潭市韶山市，东经 112.5267 */
  it("例 1：1893-12-26 07:30，真太阳时落在卯辰交界", () => {
    const chart = chartOf(1893, 12, 26, 7, 30, 112.5267)
    expect(chart.time.effective).toBe("1893-12-26 06:59:00")
    // 06:59 属卯时，问真的 07:00 属辰时，四柱前三柱一致、时柱不同
    expect(KS.map((k) => chart.pillars[k].sixtyCycle)).toEqual([
      "癸巳",
      "甲子",
      "丁酉",
      "癸卯",
    ])
    expect(chart.qiYun.forward).toBe(false)
    expect(qiYunText(chart)).toBe("6年4月13天2时")
    // 首步大运与胎元跟问真一致，命宫身宫随时支而变
    expect(chart.decades[0].sixtyCycle).toBe("癸亥")
    expect(chart.extras.fetalOrigin).toBe("乙卯")
    expect(chart.extras.ownSign).toBe("甲寅")
    expect(chart.extras.bodySign).toBe("丙辰")
  })

  /** 浙江省宁波市奉化区，东经 121.5176。问真给出的每一项都一致 */
  it("例 2：1887-10-31 12:00，与问真全项一致", () => {
    const chart = chartOf(1887, 10, 31, 12, 0, 121.5176)
    expect(chart.time.effective).toBe("1887-10-31 12:22:00")
    expect(KS.map((k) => chart.pillars[k].sixtyCycle)).toEqual([
      "丁亥",
      "庚戌",
      "己巳",
      "庚午",
    ])
    expect(chart.qiYun.forward).toBe(false)
    expect(qiYunText(chart)).toBe("7年6月7天16时")
    expect(chart.decades[0].sixtyCycle).toBe("己酉")
    expect(chart.decades[0].startYear).toBe(1895)
    expect(chart.extras).toMatchObject({
      fetalOrigin: "辛丑",
      ownSign: "癸丑",
      bodySign: "乙巳",
    })
  })

  /** 江苏省淮安市淮安区，东经 119.1411。起运比问真少 1 时 */
  it("例 3：1898-03-05 07:30，惊蛰当天，起运差 1 时", () => {
    const chart = chartOf(1898, 3, 5, 7, 30, 119.1411)
    expect(chart.time.effective).toBe("1898-03-05 07:15:00")
    expect(KS.map((k) => chart.pillars[k].sixtyCycle)).toEqual([
      "戊戌",
      "甲寅",
      "丁卯",
      "甲辰",
    ])
    // 惊蛰当天 22:32 才交节，出生时刻仍在寅月
    expect(chart.pillars.month.branch).toBe("寅")
    expect(chart.time.nextJie.name).toBe("惊蛰")
    expect(chart.time.nextJie.time.slice(0, 10)).toBe("1898-03-05")
    expect(chart.qiYun.forward).toBe(true)
    // 问真给 0年2月7天21时
    expect(qiYunText(chart)).toBe("0年2月7天20时")
    expect(chart.decades[0].sixtyCycle).toBe("乙卯")
    expect(chart.extras).toMatchObject({
      fetalOrigin: "乙巳",
      ownSign: "癸亥",
      bodySign: "己未",
    })
  })

  /**
   * 四川省广安市广安区，东经 106.6416
   *
   * 真太阳时退 56 分钟落到前一天 23:34，进了子时。问真默认 23 点即换日，
   * 日柱绕回 8 月 22 日的戊子，与按北京时 00:30 排出来的四柱恰好相同
   */
  it("例 4：1904-08-22 00:30，真太阳时跨日后仍回到同一四柱", () => {
    const chart = chartOf(1904, 8, 22, 0, 30, 106.6416)
    expect(chart.time.effective).toBe("1904-08-21 23:34:00")
    expect(KS.map((k) => chart.pillars[k].sixtyCycle)).toEqual([
      "甲辰",
      "壬申",
      "戊子",
      "壬子",
    ])
    expect(chart.qiYun.forward).toBe(true)
    // 问真给 5年9月25天7时
    expect(qiYunText(chart)).toBe("5年9月25天6时")
    expect(chart.decades[0].sixtyCycle).toBe("癸酉")
    expect(chart.extras).toMatchObject({
      fetalOrigin: "癸亥",
      ownSign: "癸酉",
      bodySign: "癸酉",
    })
  })

  /** 北京市东城区，东经 116.4164。问真给出的每一项都一致 */
  it("例 5：1906-02-07 12:00，立春之后，与问真全项一致", () => {
    const chart = chartOf(1906, 2, 7, 12, 0, 116.4164)
    expect(chart.time.effective).toBe("1906-02-07 11:31:00")
    expect(KS.map((k) => chart.pillars[k].sixtyCycle)).toEqual([
      "丙午",
      "庚寅",
      "壬午",
      "丙午",
    ])
    expect(chart.time.prevJie.name).toBe("立春")
    expect(chart.qiYun.forward).toBe(true)
    expect(qiYunText(chart)).toBe("9年1月10天10时")
    expect(chart.decades[0].sixtyCycle).toBe("辛卯")
    expect(chart.decades[0].startYear).toBe(1915)
    expect(chart.extras).toMatchObject({
      fetalOrigin: "辛巳",
      ownSign: "丁酉",
      bodySign: "丁酉",
    })
  })

  /**
   * 晚子时的时干处理是本模块与问真的一处明确分歧
   *
   * 问真开了早晚子时后只把日柱退回当日，时干仍按次日日干起；本模块按任务规则
   * 让时干跟随所用的那个日干。用例 4 的真太阳时 1904-08-21 23:34 直接查问真
   * 接口，`yzs=1` 时它给 丁亥 日配 壬子 时，壬来自次日日干戊；本模块给 庚子，
   * 庚来自当日日干丁
   */
  it("晚子时算当天时，时干跟随当日日干", () => {
    const chart = paipan(
      {
        year: 1904,
        month: 8,
        day: 22,
        hour: 0,
        minute: 30,
        gender: "male",
        longitude: 106.6416,
      },
      { useTrueSolarTime: true, lateZiAsNextDay: false }
    )
    expect(chart.time.effective).toBe("1904-08-21 23:34:00")
    expect(chart.pillars.day.sixtyCycle).toBe("丁亥")
    expect(chart.pillars.hour.sixtyCycle).toBe("庚子")
  })
})

describe("与简化实现的差异", () => {
  /**
   * 参考实现：linexjlin/GPTs 仓库 `prompts/AI算命.md` 里内嵌的 Python 排盘代码
   *
   * 那段代码有三处系统性偏差，这里把正确取值锁住，防止实现退化成同类做法：
   * 1. 年柱直接用 `(year - 4) % 60`，不看立春，跨年前后会错一位
   * 2. 月支用 `calendar.monthrange` 加闰年判断从公历月硬凑，与节气无关
   * 3. 日柱基准取 1900-01-01 却没校正该日的干支偏移，日干恰好对上、
   *    地支恒偏两位
   */
  it("年柱以立春为界，不是按公历年直接取模", () => {
    // 1990 立春在 2 月 4 日 10:14，2 月 3 日仍属己巳年
    expect(
      four({
        year: 1990,
        month: 2,
        day: 3,
        hour: 12,
        minute: 0,
        gender: "male",
      })
    ).toBe("己巳 丁丑 己亥 庚午")
    // 2024-01-01 属癸卯年子月，不是甲辰年
    expect(
      four({
        year: 2024,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        gender: "male",
      })
    ).toBe("癸卯 甲子 甲子 甲子")
  })

  it("月支由节气定，不由公历月定", () => {
    // 1990-02-05 已过立春，月支是寅不是卯
    const chart = paipan({
      year: 1990,
      month: 2,
      day: 5,
      hour: 12,
      minute: 0,
      gender: "male",
    })
    expect(chart.pillars.month.sixtyCycle).toBe("戊寅")
  })

  it("日柱地支不偏移", () => {
    // 1992-10-08 22:00 的日柱是丁巳，按未校正基准的算法会得到丁未
    expect(
      four({
        year: 1992,
        month: 10,
        day: 8,
        hour: 22,
        minute: 0,
        gender: "male",
      })
    ).toBe("壬申 庚戌 丁巳 辛亥")
  })
})
