/**
 * 测试 7：查表数据的完备性
 *
 * 藏干、纳音、十神、十二长生这四张表由 `tyme4ts` 提供，这里做全组合覆盖，
 * 确认没有缺项、没有落在预期集合之外的值；神煞表由本项目维护，逐条查完备性
 */

import { describe, expect, it } from "vitest"
import { EarthBranch, HeavenStem, SixtyCycle, TenStar, Terrain } from "tyme4ts"

import { paipan } from "../chart"
import { EARTH_BRANCHES, HEAVEN_STEMS } from "../data/constants"
import { SHEN_SHA_RULES } from "../data/shensha"
import { matchShenSha } from "../shensha"
import type { PillarKind } from "../types"

describe("六十甲子", () => {
  const all = Array.from({ length: 60 }, (_, i) => SixtyCycle.fromIndex(i))

  it("六十个干支两两不重复，且干支组合合法", () => {
    expect(new Set(all.map((c) => c.getName())).size).toBe(60)
    for (const c of all) {
      // 阳干只配阳支、阴干只配阴支
      expect(c.getHeavenStem().getIndex() % 2).toBe(
        c.getEarthBranch().getIndex() % 2
      )
    }
  })

  it("纳音三十种，每种正好两个干支", () => {
    const counts = new Map<string, number>()
    for (const c of all) {
      const s = c.getSound().getName()
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    expect(counts.size).toBe(30)
    for (const [sound, n] of counts) {
      expect(n, `纳音 ${sound}`).toBe(2)
    }
  })

  it("六十甲子分六旬，每旬十位", () => {
    const counts = new Map<string, number>()
    for (const c of all) {
      const t = c.getTen().getName()
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual(
      ["甲子", "甲戌", "甲申", "甲午", "甲辰", "甲寅"].sort()
    )
    for (const [ten, n] of counts) {
      expect(n, `${ten}旬`).toBe(10)
    }
  })

  it("每个干支有两个旬空地支，且同旬十位的旬空相同", () => {
    const byTen = new Map<string, Set<string>>()
    for (const c of all) {
      const ext = c.getExtraEarthBranches().map((b) => b.getName())
      expect(ext, `${c.getName()} 的旬空`).toHaveLength(2)
      for (const b of ext) {
        expect(EARTH_BRANCHES).toContain(b)
      }
      const key = c.getTen().getName()
      if (!byTen.has(key)) byTen.set(key, new Set())
      byTen.get(key)!.add(ext.join(""))
    }
    for (const [ten, set] of byTen) {
      expect(set.size, `${ten}旬内的旬空应当一致`).toBe(1)
    }
  })
})

describe("地支藏干", () => {
  it("十二支的藏干齐全，本气必有、层次不重复", () => {
    for (const name of EARTH_BRANCHES) {
      const branch = EarthBranch.fromName(name)
      const hides = branch.getHideHeavenStems()
      expect(hides.length, `${name} 的藏干位数`).toBeGreaterThanOrEqual(1)
      expect(hides.length, `${name} 的藏干位数`).toBeLessThanOrEqual(3)

      // 本气必须存在，且与 `getHideHeavenStemMain` 一致
      expect(branch.getHideHeavenStemMain().getName()).toBe(
        hides
          .find((h) => h.getType() === 2)!
          .getHeavenStem()
          .getName()
      )

      // 三个层次各自至多出现一次
      const types = hides.map((h) => h.getType())
      expect(new Set(types).size).toBe(types.length)

      for (const h of hides) {
        expect(HEAVEN_STEMS).toContain(h.getHeavenStem().getName())
      }
    }
  })

  it("四生四墓四旺的藏干位数符合旧例", () => {
    const expected: Record<string, number> = {
      子: 1,
      丑: 3,
      寅: 3,
      卯: 1,
      辰: 3,
      巳: 3,
      午: 2,
      未: 3,
      申: 3,
      酉: 1,
      戌: 3,
      亥: 2,
    }
    for (const [name, n] of Object.entries(expected)) {
      expect(
        EarthBranch.fromName(name).getHideHeavenStems().length,
        `${name}`
      ).toBe(n)
    }
  })
})

describe("十神", () => {
  it("十干两两组合共 100 项，每种十神各占 10 项", () => {
    const counts = new Map<string, number>()
    for (const self of HEAVEN_STEMS) {
      for (const target of HEAVEN_STEMS) {
        const star = HeavenStem.fromName(self)
          .getTenStar(HeavenStem.fromName(target))
          .getName()
        expect(TenStar.NAMES, `${self} 看 ${target}`).toContain(star)
        counts.set(star, (counts.get(star) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(10)
    for (const [star, n] of counts) {
      expect(n, `十神 ${star}`).toBe(10)
    }
  })

  it("日干看自己是比肩，看同五行异阴阳是劫财", () => {
    for (const self of HEAVEN_STEMS) {
      const s = HeavenStem.fromName(self)
      expect(s.getTenStar(s).getName()).toBe("比肩")
      // 同五行的另一个干必然是劫财
      const sibling = HEAVEN_STEMS.find(
        (x) =>
          x !== self &&
          HeavenStem.fromName(x).getElement().getName() ===
            s.getElement().getName()
      )!
      expect(s.getTenStar(HeavenStem.fromName(sibling)).getName()).toBe("劫财")
    }
  })
})

describe("十二长生", () => {
  it("十干在十二支上共 120 项，十二种状态各占 10 项", () => {
    const counts = new Map<string, number>()
    for (const stem of HEAVEN_STEMS) {
      for (const branch of EARTH_BRANCHES) {
        const t = HeavenStem.fromName(stem)
          .getTerrain(EarthBranch.fromName(branch))
          .getName()
        expect(Terrain.NAMES, `${stem} 在 ${branch}`).toContain(t)
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(12)
    for (const [t, n] of counts) {
      expect(n, `长生 ${t}`).toBe(10)
    }
  })
})

describe("神煞表", () => {
  it("十四条规则齐全且名称不重复", () => {
    expect(SHEN_SHA_RULES).toHaveLength(14)
    expect(new Set(SHEN_SHA_RULES.map((r) => r.name)).size).toBe(14)
  })

  for (const rule of SHEN_SHA_RULES) {
    it(`${rule.name} 的查表键与命中值都合法`, () => {
      const keys = Object.keys(rule.table)

      if (rule.base === "dayPillar") {
        expect(keys, `${rule.name} 应当只用 "*" 作为键`).toEqual(["*"])
      } else if (rule.base === "yearStem" || rule.base === "dayStem") {
        expect(keys.sort(), `${rule.name} 应当覆盖十干`).toEqual(
          [...HEAVEN_STEMS].sort()
        )
      } else {
        expect(keys.sort(), `${rule.name} 应当覆盖十二支`).toEqual(
          [...EARTH_BRANCHES].sort()
        )
      }

      const legal =
        rule.target === "stem"
          ? (HEAVEN_STEMS as readonly string[])
          : rule.target === "branch"
            ? (EARTH_BRANCHES as readonly string[])
            : SixtyCycle.NAMES

      for (const [key, values] of Object.entries(rule.table)) {
        expect(
          values.length,
          `${rule.name} 的 ${key} 项不应为空`
        ).toBeGreaterThan(0)
        for (const v of values) {
          expect(legal, `${rule.name} 的 ${key} 项命中值 ${v}`).toContain(v)
        }
        // 同一键下不应出现重复命中值
        expect(new Set(values).size, `${rule.name} 的 ${key} 项`).toBe(
          values.length
        )
      }

      expect(rule.note.length, `${rule.name} 必须写明出处`).toBeGreaterThan(10)
    })
  }
})

describe("神煞匹配", () => {
  const pillars = paipan({
    year: 1990,
    month: 5,
    day: 3,
    hour: 12,
    minute: 30,
    gender: "male",
  }).pillars

  it("与问真在两边都有的项上一致", () => {
    const hits = matchShenSha(pillars)
    const byPillar = (k: PillarKind) =>
      hits
        .filter((h) => h.pillar === k)
        .map((h) => h.name)
        .sort()

    // 问真给出的四柱神煞里，与本表交集的项：
    // 年柱 羊刃、月柱 太极贵人与寡宿、日柱 太极贵人与寡宿、时柱 羊刃与将星
    expect(byPillar("year")).toEqual(["将星", "羊刃"])
    expect(byPillar("month")).toEqual(["太极贵人", "寡宿"])
    expect(byPillar("day")).toEqual(["太极贵人", "寡宿"])
    expect(byPillar("hour")).toEqual(["将星", "羊刃"])
  })

  it("skipBasePillar 跳过基准柱，年柱将星随之消失", () => {
    const hits = matchShenSha(pillars, undefined, { skipBasePillar: true })
    const year = hits.filter((h) => h.pillar === "year").map((h) => h.name)
    // 将星以年支查，年支午自身即是将星，跳过基准柱后年柱只剩以日干查的羊刃
    expect(year).toEqual(["羊刃"])
    // 时柱的将星不受影响
    expect(
      hits
        .filter((h) => h.pillar === "hour")
        .map((h) => h.name)
        .sort()
    ).toEqual(["将星", "羊刃"])
    // 太极贵人与寡宿分别以日干、年支查，日柱与月柱的归属各自照旧
    expect(
      hits
        .filter((h) => h.pillar === "month")
        .map((h) => h.name)
        .sort()
    ).toEqual(["太极贵人", "寡宿"])
  })

  it("魁罡不受 skipBasePillar 影响，基准与目标本就是同一柱", () => {
    // 1904-08-22 00:30 的日柱是戊子，换一个魁罡日来验证
    const kuiGang = paipan({
      year: 1990,
      month: 5,
      day: 15,
      hour: 12,
      minute: 0,
      gender: "male",
    })
    expect(kuiGang.pillars.day.sixtyCycle).toBe("庚辰")
    for (const skip of [false, true]) {
      const hits = matchShenSha(kuiGang.pillars, undefined, {
        skipBasePillar: skip,
      })
      expect(
        hits.some((h) => h.name === "魁罡" && h.pillar === "day"),
        `skipBasePillar=${skip}`
      ).toBe(true)
    }
  })

  it("每条命中都带查法基准与出处", () => {
    for (const h of matchShenSha(pillars)) {
      expect(h.by).toMatch(/^(年干|年支|月支|日干|日支|日柱)/)
      expect(h.note.length).toBeGreaterThan(10)
    }
  })
})

describe("选项合并", () => {
  it("值为 undefined 的键不会冲掉默认值", () => {
    const chart = paipan(
      { year: 1990, month: 5, day: 3, hour: 12, minute: 30, gender: "male" },
      {
        qiYunPrecision: undefined,
        lateZiAsNextDay: undefined,
        maxAge: undefined,
      } as never,
    )
    expect(chart.options.qiYunPrecision).toBe("hour")
    expect(chart.options.lateZiAsNextDay).toBe(false)
    expect(chart.options.maxAge).toBe(100)
  })

  it("显式给出的键照常覆盖", () => {
    const chart = paipan(
      { year: 1990, month: 5, day: 3, hour: 12, minute: 30, gender: "male" },
      { qiYunPrecision: "hour", maxAge: 60 },
    )
    expect(chart.options.qiYunPrecision).toBe("hour")
    expect(chart.options.maxAge).toBe(60)
    expect(chart.decades.flatMap((d) => d.years).at(-1)?.age).toBe(60)
  })
})
