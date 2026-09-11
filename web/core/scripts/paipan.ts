#!/usr/bin/env tsx
/**
 * 排盘 CLI，用于调试与跟现有排盘工具对照
 *
 * pnpm paipan --date 1990-05-03 --time 12:30 --gender male --lng 114.15 --true-solar --qiyun hour
 */

import { parseArgs } from "node:util"

import { baziPaipan, baziToText } from "../src/bazi"
import type { Gender } from "../src/birth/types"
import type { QiYunPrecision } from "../src/bazi/types"

const USAGE = `用法：pnpm paipan [选项]

  --date <YYYY-MM-DD>   公历生日，必填
  --time <HH:mm>        出生时刻，24 小时制，默认 12:00
  --gender <male|female> 性别，默认 male
  --name <姓名>
  --location <出生地>
  --lng <经度>          东经为正，开启真太阳时时必填
  --lat <纬度>
  --true-solar          启用真太阳时校正
  --dst                 输入时刻按夏令时钟表读数处理
  --late-zi             晚子时算次日日柱
  --qiyun <day|hour>    起运折算精度，默认 hour
  --shensha-skip-base   神煞的基准柱自身不标注，对齐问真口径
  --max-age <n>         流年输出到多少虚岁，默认 100
  --strategy <name>     五行评分策略，默认 weighted
  --years               文本输出里展开流年
  --months              文本输出里展开流月
  --detail              文本输出里展开五行得分明细
  --json                输出 JSON 而不是文字排盘
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
    qiyun: { type: "string", default: "hour" },
    "shensha-skip-base": { type: "boolean", default: false },
    "max-age": { type: "string", default: "100" },
    strategy: { type: "string", default: "weighted" },
    years: { type: "boolean", default: false },
    months: { type: "boolean", default: false },
    detail: { type: "boolean", default: false },
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
if (values.qiyun !== "day" && values.qiyun !== "hour") {
  fail(`--qiyun 只能是 day 或 hour，收到 ${values.qiyun}`)
}

const chart = baziPaipan(
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
    qiYunPrecision: values.qiyun as QiYunPrecision,
    shenShaSkipBasePillar: values["shensha-skip-base"],
    maxAge: Number(values["max-age"]),
    elementStrategy: values.strategy!,
  }
)

if (values.json) {
  process.stdout.write(`${JSON.stringify(chart, null, 2)}\n`)
} else {
  process.stdout.write(
    `${baziToText(chart, { years: values.years, months: values.months, elementDetail: values.detail })}\n`
  )
}
