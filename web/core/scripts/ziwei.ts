#!/usr/bin/env tsx
/**
 * 紫微斗数排盘 CLI，用于调试与跟现有排盘工具对照
 *
 * pnpm ziwei --date 1990-05-03 --time 12:30 --gender male --lng 114.15 --true-solar
 */

import { parseArgs } from "node:util"

import type { Gender } from "../src/birth/types"
import { ziweiPaipan } from "../src/ziwei/chart"
import { ziweiLimitAt, ziweiYearly } from "../src/ziwei/fortune"
import { ziweiToText } from "../src/ziwei/text"

const USAGE = `用法：pnpm ziwei [选项]

  --date <YYYY-MM-DD>   公历生日，必填
  --time <HH:mm>        出生时刻，24 小时制，默认 12:00
  --gender <male|female> 性别，默认 male
  --name <姓名>
  --location <出生地>
  --lng <经度>          东经为正，开启真太阳时时必填
  --lat <纬度>
  --true-solar          启用真太阳时校正
  --dst                 输入时刻按夏令时钟表读数处理
  --late-zi             晚子时算次日
  --max-age <n>         小限输出到多少虚岁，默认 100
  --year <n>            附上某个公历年对应的流年流曜
  --json                输出 JSON 而不是文字命盘
`

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`)
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    date: { type: "string" },
    time: { type: "string", default: "12:00" },
    gender: { type: "string", default: "male" },
    name: { type: "string" },
    location: { type: "string" },
    lng: { type: "string" },
    lat: { type: "string" },
    "true-solar": { type: "boolean", default: false },
    dst: { type: "boolean", default: false },
    "late-zi": { type: "boolean", default: false },
    "max-age": { type: "string", default: "100" },
    year: { type: "string" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
})

if (values.help) {
  process.stdout.write(USAGE)
  process.exit(0)
}

if (!values.date) fail("缺少 --date")

const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(values.date)
if (!dateMatch) fail(`--date 格式应为 YYYY-MM-DD，收到 ${values.date}`)

const timeMatch = /^(\d{1,2}):(\d{1,2})$/.exec(values.time!)
if (!timeMatch) fail(`--time 格式应为 HH:mm，收到 ${values.time}`)

if (values.gender !== "male" && values.gender !== "female") {
  fail(`--gender 只能是 male 或 female，收到 ${values.gender}`)
}

const chart = ziweiPaipan(
  {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    gender: values.gender as Gender,
    name: values.name,
    location: values.location,
    longitude: values.lng === undefined ? undefined : Number(values.lng),
    latitude: values.lat === undefined ? undefined : Number(values.lat),
  },
  {
    useTrueSolarTime: values["true-solar"],
    useDaylightSaving: values.dst,
    lateZiAsNextDay: values["late-zi"],
    maxAge: Number(values["max-age"]),
  }
)

if (values.json) {
  process.stdout.write(`${JSON.stringify(chart, null, 2)}\n`)
} else {
  process.stdout.write(`${ziweiToText(chart)}\n`)
  if (values.year !== undefined) {
    const today = new Date()
    const limit = ziweiLimitAt(chart, {
      year: Number(values.year),
      month: today.getMonth() + 1,
      day: today.getDate(),
    })
    const yearly = ziweiYearly(chart, limit.lunarYear)
    process.stdout.write(
      `\n流年 ${yearly.sixtyCycle}（虚岁 ${yearly.age}）命宫在${yearly.lifePalace}，斗君${yearly.douJun}，小限${yearly.minorLimit}\n` +
        `流曜：${yearly.stars.map((s) => `${s.name}${s.branch}`).join(" ")}\n` +
        `流四化：${yearly.mutations.map((m) => `${m.star}化${m.mutation}`).join(" ")}\n`
    )
  }
}
