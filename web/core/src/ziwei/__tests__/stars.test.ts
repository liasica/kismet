/**
 * 安星核对：安紫微表整表，以及初级讲义安星口诀里的全部例题
 */

import { describe, expect, it } from "vitest"

import { EARTH_BRANCHES } from "../../birth/constants"
import { branchIndex, stemIndex } from "../data/tables"
import { placeStars, ziweiBranchOf, type StarContext } from "../stars"

const B = (index: number) => EARTH_BRANCHES[index]

/** 安紫微表，行为初一至三十，列为水二至火六；书中土五局十一日、火六局初九为印刷错误，已按算法改正为申与子 */
const ZIWEI_TABLE: Record<number, string> = {
  2: "丑寅寅卯卯辰辰巳巳午午未未申申酉酉戌戌亥亥子子丑丑寅寅卯卯辰",
  3: "辰丑寅巳寅卯午卯辰未辰巳申巳午酉午未戌未申亥申酉子酉戌丑戌亥",
  4: "亥辰丑寅子巳寅卯丑午卯辰寅未辰巳卯申巳午辰酉午未巳戌未申午亥",
  5: "午亥辰丑寅未子巳寅卯申丑午卯辰酉寅未辰巳戌卯申巳午亥辰酉午未",
  6: "酉午亥辰丑寅戌未子巳寅卯亥申丑午卯辰子酉寅未辰巳丑戌卯申巳午",
}

/** 造一个上下文，未给的项取书例常用值 */
function context(partial: Partial<StarContext>): StarContext {
  return {
    yearStem: 0,
    yearBranch: 0,
    month: 1,
    day: 1,
    hour: 0,
    lifePalace: 2,
    bodyPalace: 2,
    forward: true,
    yang: true,
    bureau: 5,
    ...partial,
  }
}

describe("安紫微", () => {
  it("与安紫微表逐格一致", () => {
    for (const [bureau, row] of Object.entries(ZIWEI_TABLE)) {
      for (let day = 1; day <= 30; day++) {
        expect(B(ziweiBranchOf(Number(bureau), day)), `局 ${bureau} 日 ${day}`).toBe(row[day - 1])
      }
    }
  })

  it("书例：木三局二十二日在亥，土五局二十日在巳，火六局初三在亥", () => {
    expect(B(ziweiBranchOf(3, 22))).toBe("亥")
    expect(B(ziweiBranchOf(5, 20))).toBe("巳")
    expect(B(ziweiBranchOf(6, 3))).toBe("亥")
  })
})

describe("十四正曜", () => {
  it("紫微在子则天府在辰，紫微在寅申则同宫", () => {
    const at = (bureau: number, day: number) => placeStars(context({ bureau, day })).major
    // 水二局初二十二日紫微在子
    const a = at(2, 22)
    expect(B(a.紫微)).toBe("子")
    expect(B(a.天府)).toBe("辰")
    expect(B(a.天机)).toBe("亥")
    expect(B(a.太阳)).toBe("酉")
    expect(B(a.武曲)).toBe("申")
    expect(B(a.天同)).toBe("未")
    expect(B(a.廉贞)).toBe("辰")
    expect(B(a.太阴)).toBe("巳")
    expect(B(a.贪狼)).toBe("午")
    expect(B(a.巨门)).toBe("未")
    expect(B(a.天相)).toBe("申")
    expect(B(a.天梁)).toBe("酉")
    expect(B(a.七杀)).toBe("戌")
    expect(B(a.破军)).toBe("寅")
    // 水二局初二紫微在寅
    const b = at(2, 2)
    expect(B(b.紫微)).toBe("寅")
    expect(B(b.天府)).toBe("寅")
  })
})

describe("辅佐煞与杂曜", () => {
  it("甲年天魁丑天钺未；丙年魁亥钺酉、禄巳羊午陀辰", () => {
    const jia = placeStars(context({ yearStem: stemIndex("甲") })).minor
    expect(B(jia.天魁)).toBe("丑")
    expect(B(jia.天钺)).toBe("未")
    const bing = placeStars(context({ yearStem: stemIndex("丙") })).minor
    expect(B(bing.天魁)).toBe("亥")
    expect(B(bing.天钺)).toBe("酉")
    expect(B(bing.禄存)).toBe("巳")
    expect(B(bing.擎羊)).toBe("午")
    expect(B(bing.陀罗)).toBe("辰")
  })

  it("壬辰年卯时火星巳、铃星丑；申子辰年天马在寅", () => {
    const minor = placeStars(
      context({ yearStem: stemIndex("壬"), yearBranch: branchIndex("辰"), hour: 3 })
    ).minor
    expect(B(minor.火星)).toBe("巳")
    expect(B(minor.铃星)).toBe("丑")
    expect(B(minor.天马)).toBe("寅")
  })

  it("三月生人左辅午右弼申，巳时文昌巳文曲酉，地劫辰地空午", () => {
    const minor = placeStars(context({ month: 3, hour: 5 })).minor
    expect(B(minor.左辅)).toBe("午")
    expect(B(minor.右弼)).toBe("申")
    expect(B(minor.文昌)).toBe("巳")
    expect(B(minor.文曲)).toBe("酉")
    expect(B(minor.地劫)).toBe("辰")
    expect(B(minor.地空)).toBe("午")
  })

  it("己年天官酉天福寅天厨申；寅年天哭辰天虚申；巳年红鸾戌天喜辰", () => {
    const ji = placeStars(context({ yearStem: stemIndex("己") })).adjective
    expect(B(ji.天官)).toBe("酉")
    expect(B(ji.天福)).toBe("寅")
    expect(B(ji.天厨)).toBe("申")
    const yin = placeStars(context({ yearBranch: branchIndex("寅") })).adjective
    expect(B(yin.天哭)).toBe("辰")
    expect(B(yin.天虚)).toBe("申")
    const si = placeStars(context({ yearBranch: branchIndex("巳") })).adjective
    expect(B(si.红鸾)).toBe("戌")
    expect(B(si.天喜)).toBe("辰")
  })

  it("寅卯辰年孤辰巳寡宿丑；申子辰年劫煞巳、华盖辰、咸池酉；午年大耗丑、未年大耗子", () => {
    const mao = placeStars(context({ yearBranch: branchIndex("卯") })).adjective
    expect(B(mao.孤辰)).toBe("巳")
    expect(B(mao.寡宿)).toBe("丑")
    const zi = placeStars(context({ yearBranch: branchIndex("子") })).adjective
    expect(B(zi.劫煞)).toBe("巳")
    expect(B(zi.华盖)).toBe("辰")
    expect(B(zi.咸池)).toBe("酉")
    expect(B(placeStars(context({ yearBranch: branchIndex("午") })).adjective.大耗)).toBe("丑")
    expect(B(placeStars(context({ yearBranch: branchIndex("未") })).adjective.大耗)).toBe("子")
  })

  it("戊午年旬空子丑、截空子丑，阳干正空在阳宫；辛年截空辰巳而正空在巳", () => {
    const wuWu = placeStars(
      context({ yearStem: stemIndex("戊"), yearBranch: branchIndex("午"), yang: true })
    ).adjective
    expect(B(wuWu.旬空)).toBe("子")
    expect(B(wuWu.旬空傍)).toBe("丑")
    expect(B(wuWu.截空)).toBe("子")
    expect(B(wuWu.截空傍)).toBe("丑")
    const xin = placeStars(context({ yearStem: stemIndex("辛"), yang: false })).adjective
    expect(B(xin.截空)).toBe("巳")
    expect(B(xin.截空傍)).toBe("辰")
  })

  it("天伤天使：顺者伤在交友使在疾厄，逆者互换", () => {
    // 命宫在亥，交友宫在辰、疾厄宫在午
    const forward = placeStars(context({ lifePalace: 11, forward: true })).adjective
    expect(B(forward.天伤)).toBe("辰")
    expect(B(forward.天使)).toBe("午")
    const backward = placeStars(context({ lifePalace: 11, forward: false })).adjective
    expect(B(backward.天伤)).toBe("午")
    expect(B(backward.天使)).toBe("辰")
  })

  it("日系：三台八座从辅弼起初一，恩光天贵从昌曲起初一再退一步", () => {
    // 正月子时：左辅辰 右弼戌 文昌戌 文曲辰；初十
    const adjective = placeStars(context({ month: 1, hour: 0, day: 10 })).adjective
    expect(B(adjective.三台)).toBe("丑")
    expect(B(adjective.八座)).toBe("丑")
    expect(B(adjective.恩光)).toBe("午")
    expect(B(adjective.天贵)).toBe("子")
  })

  it("月系：五月解神子、天巫巳、天月未、阴煞午、天刑丑、天姚巳", () => {
    const adjective = placeStars(context({ month: 5 })).adjective
    expect(B(adjective.解神)).toBe("子")
    expect(B(adjective.天巫)).toBe("巳")
    expect(B(adjective.天月)).toBe("未")
    expect(B(adjective.阴煞)).toBe("午")
    expect(B(adjective.天刑)).toBe("丑")
    expect(B(adjective.天姚)).toBe("巳")
  })
})
