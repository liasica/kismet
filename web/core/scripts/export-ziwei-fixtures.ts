#!/usr/bin/env tsx
/**
 * 导出紫微斗数的黄金基准
 *
 * Web 端的排盘由这个包直接算，Go 服务端是另一份实现，两者必须逐字段一致。
 * 这里把一批覆盖各个分支的输入连同它们算出的完整 `ZiweiChart` 写成 JSON，
 * Go 的测试读同一份文件跑同样的输入并逐字段比对
 *
 * 用法：`pnpm --filter @kismet/core fixtures:ziwei`
 */

import { writeFileSync } from "node:fs"

import type { PaipanInput } from "../src/birth/types"
import { ziweiPaipan } from "../src/ziwei/chart"
import { ziweiToText } from "../src/ziwei/text"
import type { ZiweiOptions } from "../src/ziwei/types"

interface Fixture {
  /** 用例说明，比对失败时用它定位 */
  label: string
  input: PaipanInput
  options: Partial<ZiweiOptions>
  chart: unknown
  /** 文字命盘，两侧的 ToText 必须逐字一致 */
  text: string
}

const fixtures: Fixture[] = []

function add(
  label: string,
  input: PaipanInput,
  options: Partial<ZiweiOptions> = {}
) {
  const chart = ziweiPaipan(input, options)
  fixtures.push({
    label,
    input,
    options,
    chart: JSON.parse(JSON.stringify(chart)),
    text: ziweiToText(chart),
  })
}

/** 默认把小限压到 12 岁，控制单个用例的体积 */
const SHORT: Partial<ZiweiOptions> = { maxAge: 12 }

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

// 参考盘，小限放到 100 岁做全量比对
add("参考盘 A 1990-05-03 12:30 阳男", male(1990, 5, 3, 12, 30), { maxAge: 100 })
add("参考盘 A 真太阳时", male(1990, 5, 3, 12, 30, 114.0833), {
  ...SHORT,
  useTrueSolarTime: true,
})
add("参考盘 B 2000-08-16 04:00 阳女", female(2000, 8, 16, 4, 0), SHORT)
add(
  "参考盘 B 带姓名与出生地",
  {
    ...female(2000, 8, 16, 4, 0, 116.4164),
    name: "东城",
    latitude: 39.9289,
    location: "北京市 东城区",
  },
  SHORT
)

// 闰月：2023 闰二月，前半按二月、后半按三月
add("闰二月初一 2023-03-22", male(2023, 3, 22, 12, 0), SHORT)
add("闰二月十五 2023-04-05", male(2023, 4, 5, 12, 0), SHORT)
add("闰二月十六 2023-04-06", male(2023, 4, 6, 12, 0), SHORT)
add("闰二月末 2023-04-19", male(2023, 4, 19, 12, 0), SHORT)

// 晚子时两种归属
add("晚子时 23:30 当日", male(1990, 5, 3, 23, 30), SHORT)
add("晚子时 23:30 次日", male(1990, 5, 3, 23, 30), {
  ...SHORT,
  lateZiAsNextDay: true,
})
add("早子时 00:30", male(1990, 5, 4, 0, 30), SHORT)

// 四组顺逆
add("阳男 1990", male(1990, 5, 3, 12, 30), SHORT)
add("阴男 1991", male(1991, 5, 3, 12, 30), SHORT)
add("阳女 1990", female(1990, 5, 3, 12, 30), SHORT)
add("阴女 1991", female(1991, 5, 3, 12, 30), SHORT)

// 十二个时辰，命宫走遍十二宫
for (let hour = 1; hour <= 23; hour += 2) {
  add(
    `1990-05-03 ${String(hour).padStart(2, "0")} 时`,
    male(1990, 5, 3, hour, 0),
    SHORT
  )
}

// 农历四月初一至三十，紫微走遍安紫微表的一列
for (let day = 25; day <= 30; day++) {
  add(`1990-04-${day} 四月初`, male(1990, 4, day, 12, 0), SHORT)
}
for (let day = 1; day <= 23; day++) {
  add(
    `1990-05-${String(day).padStart(2, "0")}`,
    male(1990, 5, day, 12, 0),
    SHORT
  )
}

// 农历年界与生肖：1990-01-26 是己巳年腊月三十，1990-01-27 是庚午年正月初一
add("除夕 1990-01-26", male(1990, 1, 26, 12, 0), SHORT)
add("正月初一 1990-01-27", male(1990, 1, 27, 12, 0), SHORT)

// 夏令时
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

// 真太阳时改时支与跨日
add("乌鲁木齐 22:55 真太阳时", male(1990, 5, 3, 22, 55, 87.6), {
  ...SHORT,
  useTrueSolarTime: true,
})
add("广安 00:30 真太阳时跨日", male(1904, 8, 22, 0, 30, 106.6416), {
  ...SHORT,
  useTrueSolarTime: true,
})

// 十天干与十二地支的年份各来一个，覆盖干系支系表
for (const year of [
  1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994, 1995,
]) {
  add(`年支覆盖 ${year}-07-15 08:00 女`, female(year, 7, 15, 8, 0), SHORT)
}

const out = "../../data/fixtures/ziwei-charts.json"
writeFileSync(out, JSON.stringify(fixtures, null, 1))
process.stdout.write(`${fixtures.length} 个用例写入 ${out}\n`)
