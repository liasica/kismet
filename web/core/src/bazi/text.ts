/**
 * 把 `Chart` 渲染成传统排盘的竖排文字表，用于肉眼对照现有排盘工具
 *
 * 四柱按列排、项目按行排，中文按两个字符宽度对齐
 */

import {
  ELEMENT_NAMES,
  PILLAR_KINDS,
  PILLAR_LABELS,
  TEN_STAR_SHORT,
} from "./data/constants"
import { groupShenShaByPillar } from "./shensha"
import type { Chart, ElementKey, PillarKind } from "./types"

/** 显示宽度，非 ASCII 一律按 2 列算 */
function width(s: string): number {
  let w = 0
  for (const ch of s) {
    w += ch.codePointAt(0)! < 0x80 ? 1 : 2
  }
  return w
}

/** 右侧补空格到指定显示宽度 */
function padEnd(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - width(s)))
}

/** 一行：行标 + 四柱各一格 */
function row(
  label: string,
  cells: readonly string[],
  labelWidth: number,
  cellWidth: number
): string {
  return (
    padEnd(label, labelWidth) + cells.map((c) => padEnd(c, cellWidth)).join("")
  ).trimEnd()
}

export interface ToTextOptions {
  /** 列出大运，默认列出 */
  decades?: boolean
  /** 列出流年，默认不列，100 岁会有上百行 */
  years?: boolean
  /** 列出流月，默认不列 */
  months?: boolean
  /** 列出五行得分明细，默认不列 */
  elementDetail?: boolean
}

export function toText(chart: Chart, options: ToTextOptions = {}): string {
  const {
    decades = true,
    years = false,
    months = false,
    elementDetail = false,
  } = options
  const ks = PILLAR_KINDS
  const lines: string[] = []

  // 头部
  const genderText = chart.gender === "male" ? "乾造" : "坤造"
  lines.push(`${chart.name ?? "未具名"}  ${genderText}`)
  lines.push(`阳历：${chart.time.input}`)
  if (chart.time.standard !== chart.time.input) {
    lines.push(
      `标准时：${chart.time.standard}（夏令时回拨 ${-chart.time.daylightSavingMinutes} 分钟）`
    )
  }
  if (chart.options.useTrueSolarTime) {
    lines.push(
      `真太阳时：${chart.time.effective}` +
        `（经度差 ${chart.time.longitudeMinutes} 分，均时差 ${chart.time.equationOfTimeMinutes} 分）`
    )
  }
  lines.push(`阴历：${chart.time.lunar}  属${chart.time.zodiac}`)
  if (chart.location?.name) {
    const lng = chart.location.longitude
    lines.push(
      `出生地：${chart.location.name}${lng === undefined ? "" : `  东经 ${lng}`}`
    )
  }
  lines.push(
    `节气：${chart.time.prevJie.name} ${chart.time.prevJie.time} 起，下一节 ${chart.time.nextJie.name} ${chart.time.nextJie.time}`
  )
  lines.push("")

  // 四柱表
  const grouped = groupShenShaByPillar(chart.shenSha)
  const shenShaCells = ks.map((k) => grouped[k].map((s) => s.name))
  const maxShenSha = Math.max(1, ...shenShaCells.map((c) => c.length))

  const table: Array<[string, string[]]> = [
    [
      "主星",
      ks.map((k) =>
        k === "day"
          ? chart.gender === "male"
            ? "元男"
            : "元女"
          : chart.pillars[k].stemTenStar
      ),
    ],
    ["天干", ks.map((k) => chart.pillars[k].stem)],
    ["地支", ks.map((k) => chart.pillars[k].branch)],
  ]

  // 藏干与副星按层次逐行展开，一柱最多三位藏干
  const maxHide = Math.max(...ks.map((k) => chart.pillars[k].hideStems.length))
  for (let i = 0; i < maxHide; i++) {
    table.push([
      i === 0 ? "藏干" : "",
      ks.map((k) => {
        const h = chart.pillars[k].hideStems[i]
        return h ? `${h.stem}${h.element}` : ""
      }),
    ])
    table.push([
      i === 0 ? "副星" : "",
      ks.map((k) => chart.pillars[k].hideStems[i]?.tenStar ?? ""),
    ])
  }

  table.push(["星运", ks.map((k) => chart.pillars[k].terrain)])
  table.push(["自坐", ks.map((k) => chart.pillars[k].selfTerrain)])
  table.push(["空亡", ks.map((k) => chart.pillars[k].extraBranches.join(""))])
  table.push(["纳音", ks.map((k) => chart.pillars[k].sound)])
  for (let i = 0; i < maxShenSha; i++) {
    table.push([i === 0 ? "神煞" : "", shenShaCells.map((c) => c[i] ?? "")])
  }

  const labelWidth = 6
  const cellWidth = Math.max(
    10,
    ...table.flatMap(([, cells]) => cells.map((c) => width(c) + 2))
  )
  lines.push(
    row(
      "日期",
      ks.map((k) => PILLAR_LABELS[k]),
      labelWidth,
      cellWidth
    )
  )
  lines.push("-".repeat(labelWidth + cellWidth * 4))
  for (const [label, cells] of table) {
    lines.push(row(label, cells, labelWidth, cellWidth))
  }
  lines.push("")

  // 五行与日主
  const e = chart.elements
  lines.push(
    `五行（${e.strategy}）：` +
      Object.entries(e.scores)
        .map(([key, v]) => `${ELEMENT_NAMES[key as ElementKey]} ${v}`)
        .join("  ") +
      `  合计 ${e.total}`
  )
  lines.push(
    `同类 ${e.supportScore}（比劫加印星）  异类 ${e.opposeScore}  日主${chart.dayStem}${chart.dayStemElement} ${e.strength}`
  )
  lines.push(
    `月令${chart.pillars.month.branch}${chart.pillars.month.branchElement}：` +
      Object.entries(e.seasonalState)
        .map(([key, v]) => `${ELEMENT_NAMES[key as ElementKey]}${v}`)
        .join("  ")
  )
  if (elementDetail) {
    for (const c of e.contributions) {
      lines.push(
        `  ${padEnd(c.source, 18)} ${c.element} +${c.weight}  ${c.reason}`
      )
    }
  }
  lines.push("")

  // 胎元命宫
  const x = chart.extras
  lines.push(
    `胎元 ${x.fetalOrigin}  胎息 ${x.fetalBreath}  命宫 ${x.ownSign}  身宫 ${x.bodySign}`
  )
  lines.push(
    `空亡（日柱${chart.pillars.day.ten}旬）：${chart.emptyBranches.join("")}`
  )
  lines.push("")

  // 起运与大运
  const q = chart.qiYun
  lines.push(`${q.forward ? "顺排" : "逆排"}  ${q.text}`)
  lines.push(
    `起运时刻 ${q.startTime}  起运虚岁 ${q.startAge}  折算依据 ${q.term.name} ${q.term.time}`
  )
  if (decades) {
    lines.push("")
    lines.push("大运：")
    for (const d of chart.decades) {
      const short = `${TEN_STAR_SHORT[d.stemTenStar] ?? d.stemTenStar}/${TEN_STAR_SHORT[d.branchTenStar] ?? d.branchTenStar}`
      lines.push(
        `  ${padEnd(d.sixtyCycle, 6)} ${short}  ${d.startAge}-${d.endAge} 岁  ${d.startYear}-${d.endYear}`
      )
      if (years) {
        for (const y of d.years) {
          const ys = `${TEN_STAR_SHORT[y.stemTenStar] ?? y.stemTenStar}/${TEN_STAR_SHORT[y.branchTenStar] ?? y.branchTenStar}`
          lines.push(
            `      ${y.year}  ${y.age} 岁  ${y.sixtyCycle} ${ys}  小运 ${y.minorFortune}`
          )
        }
      }
    }
  }

  if (months) {
    lines.push("")
    lines.push("流月：")
    for (const m of chart.months) {
      lines.push(`  ${padEnd(m.termName, 6)} ${m.termTime}  ${m.sixtyCycle}`)
    }
  }

  return lines.join("\n")
}

/** 一柱的十神简称对，大运流年格里用 */
export function shortTenStar(name: string): string {
  return TEN_STAR_SHORT[name] ?? name
}

/** 供界面按柱取值 */
export function pillarOrder(): readonly PillarKind[] {
  return PILLAR_KINDS
}
