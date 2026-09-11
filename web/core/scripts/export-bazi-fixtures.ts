#!/usr/bin/env tsx
/**
 * 导出黄金基准
 *
 * Web 端的排盘由这个包直接算，Go 服务端是另一份实现，两者必须逐字段一致。
 * 这里把一批覆盖各个分支的输入连同它们算出的完整 `Chart` 写成 JSON，
 * Go 的测试读同一份文件跑同样的输入并逐字段比对
 *
 * 用法：`pnpm --filter @kismet/core fixtures:bazi`
 */

import { writeFileSync } from "node:fs"
import { SolarTerm, SolarTime } from "tyme4ts"

import { baziPaipan, baziToText } from "../src/bazi"
import type { PaipanInput } from "../src/birth/types"
import type { BaziOptions } from "../src/bazi/types"

interface Fixture {
  /** 用例说明，比对失败时用它定位 */
  label: string
  input: PaipanInput
  options: Partial<BaziOptions>
  chart: unknown
  /** 文字命盘，只带大运不带流年流月，两侧的 ToText 必须逐字一致 */
  text: string
}

const fixtures: Fixture[] = []

function add(
  label: string,
  input: PaipanInput,
  options: Partial<BaziOptions> = {}
) {
  const chart = baziPaipan(input, options)
  fixtures.push({
    label,
    input,
    options,
    chart: JSON.parse(JSON.stringify(chart)),
    text: baziToText(chart),
  })
}

/** 默认把流年压到 12 岁，控制单个用例的体积 */
const SHORT: Partial<BaziOptions> = { maxAge: 12 }

const male = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  longitude?: number
): PaipanInput => ({
  year,
  month,
  day,
  hour,
  minute,
  gender: "male",
  longitude,
})

const female = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  longitude?: number
): PaipanInput => ({
  ...male(year, month, day, hour, minute, longitude),
  gender: "female",
})

// 基准盘，与问真逐项核对过，流年放到 100 岁做全量比对
add("问真基准盘 真太阳时 折到时辰", male(1990, 5, 3, 12, 30, 114.0833), {
  useTrueSolarTime: true,
  qiYunPrecision: "hour",
  maxAge: 100,
})
add("基准盘 北京时 折到日", male(1990, 5, 3, 12, 30, 114.0833), SHORT)
add("基准盘 神煞跳过基准柱", male(1990, 5, 3, 12, 30, 114.0833), {
  ...SHORT,
  shenShaSkipBasePillar: true,
})
add("基准盘 count 策略", male(1990, 5, 3, 12, 30, 114.0833), {
  ...SHORT,
  elementStrategy: "count",
})

// 五个公开生日，问真口径
const wz: Partial<BaziOptions> = {
  useTrueSolarTime: true,
  lateZiAsNextDay: true,
  qiYunPrecision: "hour",
  maxAge: 12,
}
add("韶山 1893-12-26 07:30", male(1893, 12, 26, 7, 30, 112.5267), wz)
add("奉化 1887-10-31 12:00", male(1887, 10, 31, 12, 0, 121.5176), wz)
add("淮安 1898-03-05 07:30", male(1898, 3, 5, 7, 30, 119.1411), wz)
add("广安 1904-08-22 00:30", male(1904, 8, 22, 0, 30, 106.6416), wz)
// 姓名、出生地、纬度只透传不参与计算，挂在这一条上覆盖两侧的序列化
add(
  "东城 1906-02-07 12:00",
  {
    ...male(1906, 2, 7, 12, 0, 116.4164),
    name: "东城",
    latitude: 39.9289,
    location: "北京市 东城区",
  },
  wz
)

// 子时六个时点，两派各一遍
for (const [d, h, mi] of [
  [3, 22, 59],
  [3, 23, 0],
  [3, 23, 59],
  [4, 0, 0],
  [4, 0, 59],
  [4, 1, 0],
] as const) {
  const at = `1990-05-0${d} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`
  add(`子时边界 ${at} 晚子时算当天`, male(1990, 5, d, h, mi), {
    ...SHORT,
    lateZiAsNextDay: false,
  })
  add(`子时边界 ${at} 晚子时算次日`, male(1990, 5, d, h, mi), {
    ...SHORT,
    lateZiAsNextDay: true,
  })
}

/** 交节时刻前后各一分钟，截到分钟位 */
function around(term: SolarTerm) {
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

// 立春与三个节的交节边界
for (const [year, name] of [
  [1990, "立春"],
  [2000, "立春"],
  [2024, "立春"],
  [1990, "清明"],
  [2000, "立秋"],
  [2024, "大雪"],
] as const) {
  const { before, after } = around(SolarTerm.fromName(year, name))
  for (const [side, t] of [
    ["前", before],
    ["后", after],
  ] as const) {
    add(
      `${year} ${name}${side}一分钟`,
      male(t.getYear(), t.getMonth(), t.getDay(), t.getHour(), t.getMinute()),
      SHORT
    )
  }
}

// 真太阳时改变时柱、跨日
add("乌鲁木齐 22:55 真太阳时", male(1990, 5, 3, 22, 55, 87.6), {
  ...SHORT,
  useTrueSolarTime: true,
})
add("广安 00:30 真太阳时跨日 算当天", male(1904, 8, 22, 0, 30, 106.6416), {
  ...SHORT,
  useTrueSolarTime: true,
})
add("广安 00:30 真太阳时跨日 算次日", male(1904, 8, 22, 0, 30, 106.6416), {
  ...SHORT,
  useTrueSolarTime: true,
  lateZiAsNextDay: true,
})

// 夏令时
add("夏令时区间内 关", male(1990, 5, 3, 12, 30), SHORT)
add("夏令时区间内 开", male(1990, 5, 3, 12, 30), {
  ...SHORT,
  useDaylightSaving: true,
})
add("夏令时回拨跨时辰", male(1990, 5, 3, 11, 30), {
  ...SHORT,
  useDaylightSaving: true,
})
add("夏令时叠加真太阳时", male(1990, 5, 3, 12, 30, 114.0833), {
  ...SHORT,
  useDaylightSaving: true,
  useTrueSolarTime: true,
})
add("夏令时区间外开开关", male(1990, 3, 3, 12, 30), {
  ...SHORT,
  useDaylightSaving: true,
})
add("夏令时起点前一分钟", male(1990, 4, 15, 2, 59), {
  ...SHORT,
  useDaylightSaving: true,
})
add("夏令时起点", male(1990, 4, 15, 3, 0), {
  ...SHORT,
  useDaylightSaving: true,
})
add("夏令时终点前一分钟", male(1990, 9, 16, 1, 59), {
  ...SHORT,
  useDaylightSaving: true,
})
add("夏令时终点", male(1990, 9, 16, 2, 0), {
  ...SHORT,
  useDaylightSaving: true,
})

// 四组顺逆
add("阳男 1990", male(1990, 5, 3, 12, 30), SHORT)
add("阴男 1991", male(1991, 5, 3, 12, 30), SHORT)
add("阳女 1990", female(1990, 5, 3, 12, 30), SHORT)
add("阴女 1991", female(1991, 5, 3, 12, 30), SHORT)

// 神煞与特殊日柱
add("魁罡日 1990-05-15", male(1990, 5, 15, 12, 0), SHORT)
add("日柱基准 1949-10-01", male(1949, 10, 1, 12, 0), SHORT)
add("十二支藏干齐全的一造", male(2024, 1, 1, 0, 0), SHORT)
add("跨年子时 2024-02-03 23:30", male(2024, 2, 3, 23, 30), SHORT)
add("节在 23 点后 2017 立春", male(2017, 2, 3, 23, 40), SHORT)

const out = "../../data/fixtures/bazi-charts.json"
writeFileSync(out, JSON.stringify(fixtures, null, 1))
process.stdout.write(`${fixtures.length} 个用例写入 ${out}\n`)
