/**
 * 分享长图：把命盘与完整解读画成一张 PNG
 *
 * 用 Canvas 2D 直接绘制，颜色取页面当前主题的 CSS 变量；八字画四柱与五行，紫微画十二宫格。
 * 解读正文按 Markdown 的块结构排版，有分享链接时左下角附二维码。
 * 所有坐标都是逻辑像素，先空跑一遍算出总高度，再按高度定倍率实际绘制
 */

import { encode } from "uqr"

import {
  baziMonthsOfYear,
  ELEMENT_KEY_ORDER,
  ELEMENT_NAMES,
  groupShenShaByPillar,
  PILLAR_LABELS,
  shortTenStar,
  ziweiLimitAt,
  ziweiYearly,
} from "@kismet/core"
import type {
  BaziChart,
  DecadeFortuneStep,
  FiveElement,
  PillarKind,
  ZiweiChart,
  ZiweiLimit,
  ZiweiMutation,
  ZiweiPalace,
  ZiweiStar,
  ZiweiYear,
} from "@kismet/core"
import { SYSTEMS } from "@/lib/system"

/** 要画的命盘，按体系分发 */
export type PosterSubject =
  { system: "bazi"; chart: BaziChart } | { system: "ziwei"; chart: ZiweiChart }

const WIDTH = 720
const PADDING = 56
const CONTENT = WIDTH - PADDING * 2
/** 导出倍率上限 */
const SCALE = 2
/** 画布总像素上限，Safari 超过约 1677 万像素会画不出来，留出余量 */
const MAX_PIXELS = 16_000_000

const KINDS: readonly PillarKind[] = ["year", "month", "day", "hour"]

const SANS = "'Oxanium Variable', 'Noto Serif SC Variable', sans-serif"
const HEADING = "'Raleway Variable', 'Noto Serif SC Variable', sans-serif"
const SERIF = "'Noto Serif SC Variable', serif"

/** 正文与列表的字号与行高 */
const BODY_SIZE = 14
const BODY_LINE = 24

export interface PosterOptions {
  /** 分享链接，有则画成二维码 */
  shareUrl?: string
  /** 解读正文 Markdown，有则整段排进图里 */
  analysis?: string
}

/** 页面当前主题的颜色 */
interface Palette {
  background: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  destructive: string
  primary: string
  element: Record<FiveElement, string>
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string) => style.getPropertyValue(name).trim()
  return {
    background: read("--background"),
    foreground: read("--foreground"),
    muted: read("--muted"),
    mutedForeground: read("--muted-foreground"),
    border: read("--border"),
    destructive: read("--destructive"),
    primary: read("--primary"),
    element: {
      木: read("--wood"),
      火: read("--fire"),
      土: read("--earth"),
      金: read("--metal"),
      水: read("--water"),
    },
  }
}

/** 四化标记的颜色：禄权科取木火水，忌取警示色 */
function mutationColor(palette: Palette, mutation: ZiweiMutation): string {
  switch (mutation) {
    case "禄":
      return palette.element.木
    case "权":
      return palette.element.火
    case "科":
      return palette.element.水
    default:
      return palette.destructive
  }
}

/** 一段行内文字，只区分粗体 */
interface Run {
  text: string
  bold: boolean
}

/** 折好的一行，由若干粗细不同的片段拼成 */
type Line = Run[]

/** 解读正文的块 */
type Block =
  | { kind: "heading"; level: number; runs: Run[] }
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "item"; depth: number; marker?: string; runs: Run[] }
  | { kind: "quote"; runs: Run[] }
  | { kind: "rule" }
  | { kind: "table"; rows: Run[][][] }

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("浏览器不支持 Canvas")
  ctx.textBaseline = "middle"
  return ctx
}

/** 带纵向游标的画笔，文字一律以竖直中线定位；dry 为 true 时只量不画 */
class Painter {
  readonly ctx: CanvasRenderingContext2D
  readonly palette: Palette
  readonly dry: boolean
  y = PADDING

  constructor(ctx: CanvasRenderingContext2D, palette: Palette, dry: boolean) {
    this.ctx = ctx
    this.palette = palette
    this.dry = dry
  }

  font(size: number, family: string, weight = 400) {
    this.ctx.font = `${weight} ${size}px ${family}`
  }

  /** 字距，画完记得归零 */
  spacing(value: string) {
    this.ctx.letterSpacing = value
  }

  width(content: string): number {
    return this.ctx.measureText(content).width
  }

  text(
    content: string,
    x: number,
    y: number,
    color: string,
    align: CanvasTextAlign = "left"
  ) {
    if (this.dry) return
    this.ctx.fillStyle = color
    this.ctx.textAlign = align
    this.ctx.fillText(content, x, y)
  }

  rect(x: number, y: number, width: number, height: number, color: string) {
    if (this.dry) return
    this.ctx.fillStyle = color
    this.ctx.fillRect(x, y, width, height)
  }

  circle(x: number, y: number, radius: number, color: string) {
    if (this.dry) return
    this.ctx.fillStyle = color
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius, 0, Math.PI * 2)
    this.ctx.fill()
  }

  /** 横贯内容区的细线 */
  rule() {
    this.rect(PADDING, this.y, CONTENT, 1, this.palette.border)
  }

  /** 空一段再画一条细线再空一段 */
  section() {
    this.y += 28
    this.rule()
    this.y += 28
  }

  /** 按宽度逐字折行，超出行数时最后一行截断加省略号 */
  wrap(content: string, maxWidth: number, maxLines: number): string[] {
    const chars = Array.from(content.trim().replace(/\s+/g, " "))
    const lines: string[] = []
    let line = ""
    for (const ch of chars) {
      if (!line || this.width(line + ch) <= maxWidth) {
        line += ch
        continue
      }
      lines.push(line)
      line = ch === " " ? "" : ch
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1]
        while (last && this.width(last + "……") > maxWidth) {
          last = last.slice(0, -1)
        }
        lines[maxLines - 1] = last + "……"
        return lines
      }
    }
    if (line) lines.push(line)
    return lines
  }

  /** 按宽度逐字折行，粗体与常规片段各按自己的字体量宽 */
  wrapRuns(
    runs: Run[],
    maxWidth: number,
    size: number,
    family: string
  ): Line[] {
    const lines: Line[] = []
    let line: Line = []
    let width = 0
    for (const run of runs) {
      this.font(size, family, run.bold ? 600 : 400)
      for (const ch of Array.from(run.text)) {
        const w = this.width(ch)
        if (width + w > maxWidth && line.length > 0) {
          lines.push(line)
          line = []
          width = 0
          if (ch === " ") continue
        }
        const last = line[line.length - 1]
        if (last && last.bold === run.bold) last.text += ch
        else line.push({ text: ch, bold: run.bold })
        width += w
      }
    }
    if (line.length > 0) lines.push(line)
    return lines
  }

  /** 逐行画出折好的文字，游标随之下移 */
  lines(
    lines: Line[],
    x: number,
    size: number,
    family: string,
    color: string,
    lineHeight: number
  ) {
    for (const line of lines) {
      let cursor = x
      for (const run of line) {
        this.font(size, family, run.bold ? 600 : 400)
        this.text(run.text, cursor, this.y + lineHeight / 2, color)
        cursor += this.width(run.text)
      }
      this.y += lineHeight
    }
  }

  /** 折行并画出一段正文 */
  paragraph(
    runs: Run[],
    x: number,
    maxWidth: number,
    size: number,
    family: string,
    color: string,
    lineHeight: number
  ) {
    this.lines(
      this.wrapRuns(runs, maxWidth, size, family),
      x,
      size,
      family,
      color,
      lineHeight
    )
  }
}

/** 把行内 Markdown 拆成粗体与常规片段，其余标记去掉 */
function parseInline(text: string): Run[] {
  const cleaned = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")

  const runs: Run[] = []
  for (const part of cleaned.split(/(\*\*[^*]+\*\*|__[^_]+__)/)) {
    if (!part) continue
    const bold = /^(\*\*|__)/.test(part)
    const body = (bold ? part.slice(2, -2) : part)
      .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, "$1")
      .replace(/(^|\s)_(?=\S)([^_]+?)(?<=\S)_(?=\s|$)/g, "$1$2")
      .replace(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
    if (body) runs.push({ text: body, bold })
  }
  return runs
}

/** 汉字与常见的全角标点 */
const CJK = /[\p{Script=Han}，。、；：？！「」『』（）《》〈〉【】…—～]/u

/** 段落里的软换行：两侧都是中文就直接相连，否则补一个空格 */
function joinLines(lines: string[]): string {
  return lines.reduce((acc, line) => {
    if (!acc) return line
    const glue = CJK.test(acc.slice(-1)) && CJK.test(line[0]) ? "" : " "
    return acc + glue + line
  }, "")
}

/** 把解读 Markdown 拆成块：标题、段落、列表项、引用、分隔线、表格 */
function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let quote: string[] = []
  let table: string[][] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({
        kind: "paragraph",
        runs: parseInline(joinLines(paragraph)),
      })
      paragraph = []
    }
  }
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push({ kind: "quote", runs: parseInline(joinLines(quote)) })
      quote = []
    }
  }
  const flushTable = () => {
    if (table.length > 0) {
      blocks.push({
        kind: "table",
        rows: table.map((row) => row.map(parseInline)),
      })
      table = []
    }
  }
  const flush = () => {
    flushParagraph()
    flushQuote()
    flushTable()
  }

  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        runs: parseInline(heading[2].replace(/\s+#+$/, "")),
      })
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      blocks.push({ kind: "rule" })
      continue
    }

    const item = /^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/.exec(line)
    if (item) {
      flush()
      blocks.push({
        kind: "item",
        depth: Math.min(3, Math.floor(item[1].length / 2)),
        marker: item[2] ? `${item[2]}.` : undefined,
        runs: parseInline(item[3]),
      })
      continue
    }

    const quoted = /^\s*>\s?(.*)$/.exec(line)
    if (quoted) {
      flushParagraph()
      flushTable()
      quote.push(quoted[1])
      continue
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph()
      flushQuote()
      // 表头下面的对齐行不是数据
      if (!/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) {
        table.push(
          line
            .trim()
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim())
        )
      }
      continue
    }

    flushQuote()
    flushTable()
    // 列表项下面缩进的续行接到上一项
    const last = blocks[blocks.length - 1]
    if (
      /^\s{2,}/.test(raw) &&
      last?.kind === "item" &&
      paragraph.length === 0
    ) {
      last.runs.push(...parseInline(" " + line.trim()))
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

/** 海报上会出现的全部文字，据此加载字体分片 */
function textOf(
  subject: PosterSubject,
  analysis?: string,
  shareUrl?: string
): string {
  const { chart } = subject
  const common = [
    "FOUR PILLARS PURPLE STAR KISMET 遇见 未具名 乾造 坤造",
    "命理解读 扫码查看完整命盘与解读",
    "0123456789.-:（），……",
    chart.name,
    analysis,
    shareUrl,
  ]
  if (subject.system === "ziwei") {
    const c = subject.chart
    return [
      ...common,
      "阳男 阴男 阳女 阴女 时 大限顺行 逆行 命宫 身宫 小限 命主 身主 生年四化 借对宫 身 庙旺地平闲陷 禄权科忌化 岁 尚未起限",
      c.lunar.hourBranch,
      c.bureau.name,
      c.lifeMaster,
      c.bodyMaster,
      ...c.palaces.flatMap((p) => [
        p.name,
        p.sixtyCycle,
        p.changSheng,
        p.boShi,
        ...[...p.majorStars, ...p.minorStars, ...p.adjectiveStars].map(
          (s) => s.name
        ),
      ]),
      ...ziweiLimitYears(c).flatMap((y) => [y.sixtyCycle, y.lifePalace]),
    ].join("")
  }
  if (subject.system === "bazi") {
    const pillars = KINDS.map((k) => subject.chart.pillars[k])
    const decade = currentDecade(subject.chart)
    return [
      ...common,
      "元男 元女 日主 同类 异类 合计 胎元 胎息 命宫 身宫 主星 干支 藏干 星运 自坐 空亡 纳音 神煞",
      "大运 流月 岁 顺排 逆排 起运虚岁 小运 以节为界",
      ...Object.values(PILLAR_LABELS),
      ...pillars.flatMap((p) => [
        p.stem,
        p.branch,
        p.stemTenStar,
        p.sound,
        p.terrain,
        p.selfTerrain,
        p.extraBranches.join(""),
        ...p.hideStems.flatMap((h) => [h.stem, h.tenStar]),
      ]),
      ...subject.chart.shenSha.map((s) => s.name),
      ...Object.values(ELEMENT_NAMES),
      ...Object.values(subject.chart.elements.seasonalState),
      subject.chart.elements.strength,
      ...Object.values(subject.chart.extras),
      ...(decade
        ? decade.years.flatMap((y) => [
            y.sixtyCycle,
            shortTenStar(y.stemTenStar),
            shortTenStar(y.branchTenStar),
            y.minorFortune,
          ])
        : []),
      ...baziMonthsOfYear(subject.chart, new Date().getFullYear()).flatMap(
        (m) => [m.sixtyCycle, m.termName]
      ),
    ].join("")
  }
  return common.join("")
}

/** Canvas 不会自己触发字体加载，先把要用到的字体分片都取回来 */
async function loadFonts(text: string) {
  const fonts = [
    `400 16px ${SERIF}`,
    `400 16px ${SANS}`,
    `600 16px ${SANS}`,
    `500 16px ${HEADING}`,
    `600 16px ${HEADING}`,
  ]
  await Promise.all(fonts.map((font) => document.fonts.load(font, text)))
}

/** 眉题、姓名与乾坤造；分享出去的图不带出生时刻、农历日期与出生地 */
function drawHeader(p: Painter, subject: PosterSubject) {
  const { palette } = p
  const { chart } = subject

  p.font(11, HEADING, 600)
  p.spacing("0.2em")
  p.text(
    SYSTEMS[subject.system].eyebrow.toUpperCase(),
    PADDING,
    p.y + 6,
    palette.mutedForeground
  )
  p.text("KISMET", WIDTH - PADDING, p.y + 6, palette.mutedForeground, "right")
  p.spacing("0px")
  p.y += 32

  p.font(36, HEADING, 500)
  const name = chart.name || "未具名"
  p.text(name, PADDING, p.y + 18, palette.foreground)
  const badgeX = PADDING + p.width(name) + 16
  const gender = chart.gender === "male" ? "乾造" : "坤造"
  p.font(12, SANS, 600)
  p.spacing("0.1em")
  p.rect(badgeX, p.y + 7, p.width(gender) + 16, 22, palette.muted)
  p.text(gender, badgeX + 8, p.y + 18, palette.foreground)
  p.spacing("0px")
  p.y += 50
}

/** 四柱主表：行标在左，四柱各一列，与页面的基本盘同样的行 */
function drawPillars(p: Painter, chart: BaziChart) {
  const { palette } = p
  const labelWidth = 40
  const column = (CONTENT - labelWidth) / 4
  const centerOf = (i: number) => PADDING + labelWidth + column * i + column / 2
  const grouped = groupShenShaByPillar(chart.shenSha)
  const maxHide = Math.max(
    ...KINDS.map((k) => chart.pillars[k].hideStems.length)
  )
  const maxShenSha = Math.max(...KINDS.map((k) => grouped[k].length))

  /** 行标，y 是本行文字的竖直中线 */
  const label = (content: string, y: number) => {
    p.font(11, SANS)
    p.text(content, PADDING, y, palette.mutedForeground)
  }

  p.font(11, SANS, 600)
  p.spacing("0.15em")
  KINDS.forEach((k, i) => {
    p.text(
      PILLAR_LABELS[k],
      centerOf(i),
      p.y + 6,
      palette.mutedForeground,
      "center"
    )
  })
  p.spacing("0px")
  p.y += 20
  p.rule()
  p.y += 10

  label("主星", p.y + 8)
  p.font(13, SANS)
  KINDS.forEach((k, i) => {
    const star =
      k === "day"
        ? chart.gender === "male"
          ? "元男"
          : "元女"
        : chart.pillars[k].stemTenStar
    p.text(star, centerOf(i), p.y + 8, palette.foreground, "center")
  })
  p.y += 30

  label("干支", p.y + 94)
  p.font(84, SERIF)
  KINDS.forEach((k, i) => {
    const pillar = chart.pillars[k]
    p.text(
      pillar.stem,
      centerOf(i),
      p.y + 46,
      palette.element[pillar.stemElement],
      "center"
    )
    p.text(
      pillar.branch,
      centerOf(i),
      p.y + 142,
      palette.element[pillar.branchElement],
      "center"
    )
  })
  p.y += 200

  for (let row = 0; row < maxHide; row++) {
    if (row === 0) label("藏干", p.y + 8)
    p.font(13, SANS)
    KINDS.forEach((k, i) => {
      const hide = chart.pillars[k].hideStems[row]
      if (!hide) return
      const x = centerOf(i) - p.width(`${hide.stem} ${hide.tenStar}`) / 2
      p.text(hide.stem, x, p.y + 8, palette.element[hide.element])
      p.text(
        hide.tenStar,
        x + p.width(`${hide.stem} `),
        p.y + 8,
        palette.mutedForeground
      )
    })
    p.y += 22
  }

  const rows: ReadonlyArray<readonly [string, (k: PillarKind) => string]> = [
    ["星运", (k) => chart.pillars[k].terrain],
    ["自坐", (k) => chart.pillars[k].selfTerrain],
    ["空亡", (k) => chart.pillars[k].extraBranches.join("")],
    ["纳音", (k) => chart.pillars[k].sound],
  ]
  for (const [name, valueOf] of rows) {
    label(name, p.y + 8)
    p.font(12, SANS)
    KINDS.forEach((k, i) => {
      p.text(valueOf(k), centerOf(i), p.y + 8, palette.foreground, "center")
    })
    p.y += 22
  }

  for (let row = 0; row < maxShenSha; row++) {
    if (row === 0) label("神煞", p.y + 8)
    p.font(11, SANS)
    KINDS.forEach((k, i) => {
      const hit = grouped[k][row]
      if (!hit) return
      p.text(hit.name, centerOf(i), p.y + 8, palette.mutedForeground, "center")
    })
    p.y += 20
  }
  p.y -= 4
}

/** 左栏五行得分条，右栏日主强弱与胎元、胎息、命宫、身宫 */
function drawElements(p: Painter, chart: BaziChart) {
  const { palette } = p
  const e = chart.elements
  const max = Math.max(...Object.values(e.scores), 1)
  const top = p.y
  const barX = PADDING + 28
  const barWidth = 220

  ELEMENT_KEY_ORDER.forEach((key, i) => {
    const el = ELEMENT_NAMES[key]
    const y = top + i * 26
    p.font(16, SERIF)
    p.text(el, PADDING, y + 10, palette.element[el])
    p.rect(barX, y + 7, barWidth, 6, palette.muted)
    p.rect(
      barX,
      y + 7,
      (e.scores[key] / max) * barWidth,
      6,
      palette.element[el]
    )
    p.font(13, SANS)
    p.text(
      String(e.scores[key]),
      barX + barWidth + 44,
      y + 10,
      palette.foreground,
      "right"
    )
    p.font(12, SANS)
    p.text(
      e.seasonalState[key],
      barX + barWidth + 58,
      y + 10,
      palette.mutedForeground
    )
  })

  const rightX = PADDING + 380
  const stemColor = palette.element[chart.dayStemElement]
  let x = rightX
  const piece = (
    content: string,
    color: string,
    size: number,
    family: string
  ) => {
    p.font(size, family)
    p.text(content, x, top + 10, color)
    x += p.width(content)
  }
  piece("日主 ", palette.foreground, 15, SANS)
  piece(chart.dayStem, stemColor, 18, SERIF)
  piece(chart.dayStemElement, stemColor, 18, SERIF)
  piece(`  ${e.strength}`, palette.foreground, 15, SANS)

  p.font(13, SANS)
  p.text(
    `同类 ${e.supportScore}   异类 ${e.opposeScore}   合计 ${e.total}`,
    rightX,
    top + 38,
    palette.mutedForeground
  )

  const extras: Array<[string, string]> = [
    ["胎元", chart.extras.fetalOrigin],
    ["胎息", chart.extras.fetalBreath],
    ["命宫", chart.extras.ownSign],
    ["身宫", chart.extras.bodySign],
  ]
  extras.forEach(([label, value], i) => {
    const y = top + 72 + Math.floor(i / 2) * 26
    const cellX = rightX + (i % 2) * 112
    p.font(13, SANS)
    p.text(label, cellX, y, palette.mutedForeground)
    p.font(15, SERIF)
    p.text(value, cellX + 36, y, palette.foreground)
  })

  p.y = top + 5 * 26
}

/** 运限格：头一行干支，下面几行小字 */
interface Chip {
  title: string
  lines: string[]
  /** 今年所在的那一格，描边并着主题色 */
  current?: boolean
}

/** 把运限格排成网格，游标停在最后一行底部 */
function drawChips(p: Painter, chips: Chip[], columns: number) {
  const { palette } = p
  const gap = 8
  const cell = (CONTENT - gap * (columns - 1)) / columns
  const maxLines = Math.max(...chips.map((c) => c.lines.length))
  const height = 28 + maxLines * 15

  chips.forEach((chip, i) => {
    const x = PADDING + (i % columns) * (cell + gap)
    const y = p.y + Math.floor(i / columns) * (height + gap)
    p.rect(x, y, cell, height, palette.muted)
    if (chip.current) {
      p.rect(x, y, cell, 1, palette.primary)
      p.rect(x, y + height - 1, cell, 1, palette.primary)
      p.rect(x, y, 1, height, palette.primary)
      p.rect(x + cell - 1, y, 1, height, palette.primary)
    }
    const cx = x + cell / 2
    p.font(16, SERIF)
    p.text(
      chip.title,
      cx,
      y + 18,
      chip.current ? palette.primary : palette.foreground,
      "center"
    )
    p.font(11, SANS)
    chip.lines.forEach((line, row) => {
      p.text(line, cx, y + 34 + row * 15, palette.mutedForeground, "center")
    })
  })

  const rows = Math.ceil(chips.length / columns)
  p.y += rows * (height + gap) - gap
}

/** 一段运限的小标题：左边标题，右边补充 */
function drawFortuneTitle(p: Painter, title: string, detail: string) {
  const { palette } = p
  p.font(13, SANS, 600)
  p.text(title, PADDING, p.y + 8, palette.foreground)
  p.font(11, SANS)
  p.text(detail, WIDTH - PADDING, p.y + 8, palette.mutedForeground, "right")
  p.y += 26
}

/** 今年所在的那步大运，尚未起运时取头一步 */
function currentDecade(chart: BaziChart): DecadeFortuneStep | undefined {
  const now = new Date().getFullYear()
  return (
    chart.decades.find((d) => now >= d.startYear && now <= d.endYear) ??
    chart.decades[0]
  )
}

/** 今年所在的那步大运与它的流年，再接今年的流月 */
function drawBaziFortune(p: Painter, chart: BaziChart) {
  const now = new Date().getFullYear()
  const decade = currentDecade(chart)
  if (!decade) return

  drawFortuneTitle(
    p,
    `大运 ${decade.sixtyCycle}`,
    `${shortTenStar(decade.stemTenStar)}/${shortTenStar(decade.branchTenStar)}  ${decade.startAge}-${decade.endAge} 岁  ${decade.startYear}-${decade.endYear}  ${chart.qiYun.forward ? "顺排" : "逆排"}  起运虚岁 ${chart.qiYun.startAge}`
  )
  drawChips(
    p,
    decade.years.map((y) => ({
      title: y.sixtyCycle,
      lines: [
        `${shortTenStar(y.stemTenStar)}/${shortTenStar(y.branchTenStar)}`,
        `${y.age} 岁  ${y.year}`,
        `小运 ${y.minorFortune}`,
      ],
      current: y.year === now,
    })),
    5
  )
  p.y += 24

  drawFortuneTitle(p, `流月 ${now}`, "以节为界")
  drawChips(
    p,
    baziMonthsOfYear(chart, now).map((m) => ({
      title: m.sixtyCycle,
      lines: [
        `${shortTenStar(m.stemTenStar)}/${shortTenStar(m.branchTenStar)}`,
        m.termName,
        m.termTime.slice(5, 10),
      ],
    })),
    6
  )
}

/** 十二宫格的尺寸：四列等宽，行高按内容伸缩，中央四格合并 */
const GRID_CELL = CONTENT / 4
/** 一行宫格的最小高度 */
const MIN_GRID_ROW = 150
/** 中央四格放得下命主信息所需的高度 */
const GRID_CENTER = 210
/** 杂曜最多折几行 */
const ADJECTIVE_LINES = 6
/** 一宫上下留白与底部宫名、大限两行占掉的高度 */
const PALACE_CHROME = 16 + 28

/** 十二宫在网格里的列与行：巳午未申一行、寅丑子亥一行 */
const PALACE_CELLS: ReadonlyArray<readonly [string, number, number]> = [
  ["巳", 0, 0],
  ["午", 1, 0],
  ["未", 2, 0],
  ["申", 3, 0],
  ["辰", 0, 1],
  ["酉", 3, 1],
  ["卯", 0, 2],
  ["戌", 3, 2],
  ["寅", 0, 3],
  ["丑", 1, 3],
  ["子", 2, 3],
  ["亥", 3, 3],
]

/**
 * 一行星曜，每颗后面跟小字的庙陷与四化，超宽换行，返回画完后的 y
 *
 * measure 为真时只走版面不落笔，用来先量一宫要多高
 */
function drawStarRow(
  p: Painter,
  stars: ZiweiStar[],
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  family: string,
  measure = false
): number {
  if (stars.length === 0) return y
  const { palette } = p
  const put = (content: string, cx: number, cy: number, color: string) => {
    if (!measure) p.text(content, cx, cy, color)
  }
  const lineHeight = size + 6
  let cx = x
  let cy = y
  for (const star of stars) {
    p.font(size, family)
    const nameWidth = p.width(star.name)
    p.font(9, SANS, 600)
    const tailWidth = p.width((star.brightness ?? "") + (star.mutation ?? ""))
    if (cx > x && cx + nameWidth + tailWidth > x + maxWidth) {
      cx = x
      cy += lineHeight
    }
    p.font(size, family)
    put(star.name, cx, cy + lineHeight / 2, palette.foreground)
    cx += nameWidth + 1
    if (star.brightness) {
      p.font(9, SANS)
      put(star.brightness, cx, cy + lineHeight / 2 - 3, palette.mutedForeground)
      cx += p.width(star.brightness)
    }
    if (star.mutation) {
      p.font(9, SANS, 600)
      put(
        star.mutation,
        cx,
        cy + lineHeight / 2 + 4,
        mutationColor(palette, star.mutation)
      )
      cx += p.width(star.mutation)
    }
    cx += 6
  }
  return cy + lineHeight + 2
}

/** 一宫的杂曜折行后的文字 */
function adjectiveLines(p: Painter, palace: ZiweiPalace): string[] {
  const adjectives = palace.adjectiveStars.map((s) => s.name).join(" ")
  if (!adjectives) return []
  p.font(9, SANS)
  return p.wrap(adjectives, GRID_CELL - 16, ADJECTIVE_LINES)
}

/** 一宫星曜部分所需的高度，据此定这一行宫格多高 */
function palaceHeight(p: Painter, palace: ZiweiPalace): number {
  const width = GRID_CELL - 16
  let cy = drawStarRow(p, palace.majorStars, 0, 0, width, 17, SERIF, true)
  if (palace.majorStars.length === 0) cy += 22
  cy = drawStarRow(p, palace.minorStars, 0, cy, width, 12, SANS, true)
  return PALACE_CHROME + cy + adjectiveLines(p, palace).length * 13
}

/** 一宫：正曜大字、辅佐煞中字、杂曜小字折行，底部宫名干支与大限 */
function drawPalaceCell(
  p: Painter,
  palace: ZiweiPalace,
  x: number,
  y: number,
  height: number
) {
  const { palette } = p
  const inner = x + 8
  const width = GRID_CELL - 16
  const bottom = y + height - 8
  let cy = y + 8

  cy = drawStarRow(p, palace.majorStars, inner, cy, width, 17, SERIF)
  if (palace.majorStars.length === 0) {
    p.font(11, SANS)
    p.text("借对宫", inner, cy + 10, palette.mutedForeground)
    cy += 22
  }
  cy = drawStarRow(p, palace.minorStars, inner, cy, width, 12, SANS)

  p.font(9, SANS)
  for (const line of adjectiveLines(p, palace)) {
    p.text(line, inner, cy + 6, palette.mutedForeground)
    cy += 13
  }

  p.font(9, SANS)
  p.text(
    `${palace.decade.startAge}-${palace.decade.endAge}  ${palace.changSheng}  ${palace.boShi}`,
    inner,
    bottom - 22,
    palette.mutedForeground
  )
  p.font(11, SANS, 600)
  p.text(
    palace.name + (palace.isBodyPalace ? " 身" : ""),
    inner,
    bottom - 6,
    palette.foreground
  )
  p.font(12, SERIF)
  p.text(
    palace.sixtyCycle,
    x + GRID_CELL - 8,
    bottom - 6,
    palette.foreground,
    "right"
  )
}

/** 中央四格：时辰阴阳顺逆、命身宫、五行局、命主身主、生年四化 */
function drawGridCenter(
  p: Painter,
  chart: ZiweiChart,
  x: number,
  y: number,
  height: number
) {
  const { palette } = p
  const centerX = x + GRID_CELL
  let cy = y + height / 2 - 60
  const line = (
    content: string,
    size: number,
    family: string,
    color: string
  ) => {
    p.font(size, family)
    p.text(content, centerX, cy, color, "center")
    cy += size + 14
  }
  line(
    `${chart.lunar.hourBranch}时  ${chart.yang ? "阳" : "阴"}${chart.gender === "male" ? "男" : "女"}  大限${chart.forward ? "顺" : "逆"}行`,
    13,
    SANS,
    palette.mutedForeground
  )
  line(
    `命宫 ${chart.lifePalace}    身宫 ${chart.bodyPalace}`,
    15,
    SANS,
    palette.foreground
  )
  line(chart.bureau.name, 24, SERIF, palette.element[chart.bureau.element])
  line(
    `命主 ${chart.lifeMaster}    身主 ${chart.bodyMaster}`,
    13,
    SANS,
    palette.foreground
  )

  // 生年四化：星名常规、化曜着色，整行居中
  p.font(13, SANS)
  const parts = chart.mutations.map(
    (m) => [m.star, `化${m.mutation}`, m.mutation] as const
  )
  const total = parts.reduce(
    (sum, [star, tail]) => sum + p.width(star + tail) + 10,
    -10
  )
  let cx = centerX - total / 2
  for (const [star, tail, mutation] of parts) {
    p.font(13, SANS)
    p.text(star, cx, cy, palette.foreground)
    cx += p.width(star)
    p.font(13, SANS, 600)
    p.text(tail, cx, cy, mutationColor(palette, mutation))
    cx += p.width(tail) + 10
  }
}

/** 十二宫格：行高先按各宫内容量一遍，再画外框、格线、十二宫与中央信息 */
function drawPalaces(p: Painter, chart: ZiweiChart) {
  const { palette } = p
  const top = p.y
  const palaceOf = (branch: string) =>
    chart.palaces.find((item) => item.branch === branch)

  const heights = [0, 1, 2, 3].map((row) =>
    Math.max(
      MIN_GRID_ROW,
      ...PALACE_CELLS.filter(([, , r]) => r === row).map(([branch]) => {
        const palace = palaceOf(branch)
        return palace ? palaceHeight(p, palace) : 0
      })
    )
  )
  // 中间两行还要放得下中央四格
  const center = heights[1]! + heights[2]!
  if (center < GRID_CENTER) {
    const more = (GRID_CENTER - center) / 2
    heights[1] += more
    heights[2] += more
  }
  const rowTop = (row: number) =>
    top + heights.slice(0, row).reduce((sum, h) => sum + h, 0)
  const total = rowTop(4) - top

  for (let i = 0; i <= 4; i++) {
    p.rect(PADDING, rowTop(i), CONTENT, 1, palette.border)
    p.rect(PADDING + i * GRID_CELL, top, 1, total + 1, palette.border)
  }
  // 中央四格之间的格线抹掉，合成一块
  p.rect(
    PADDING + GRID_CELL + 1,
    rowTop(1) + 1,
    GRID_CELL * 2 - 1,
    heights[1]! + heights[2]! - 1,
    palette.background
  )

  for (const [branch, col, row] of PALACE_CELLS) {
    const palace = palaceOf(branch)
    if (palace) {
      drawPalaceCell(
        p,
        palace,
        PADDING + col * GRID_CELL,
        rowTop(row),
        heights[row]!
      )
    }
  }
  drawGridCenter(
    p,
    chart,
    PADDING + GRID_CELL,
    rowTop(1),
    heights[1]! + heights[2]!
  )
  p.y = top + total + 1
}

/** 今天所处的运限 */
function currentLimit(chart: ZiweiChart): ZiweiLimit {
  const today = new Date()
  return ziweiLimitAt(chart, {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  })
}

/** 今年所在的那步大限覆盖的流年，尚未起限时为空 */
function ziweiLimitYears(chart: ZiweiChart): ZiweiYear[] {
  const decade = currentLimit(chart).decade
  if (!decade) return []
  const years: ZiweiYear[] = []
  for (let year = decade.startYear; year <= decade.endYear; year++) {
    years.push(ziweiYearly(chart, year))
  }
  return years
}

/** 今年所在的那步大限与它的流年 */
function drawZiweiLimit(p: Painter, chart: ZiweiChart) {
  const limit = currentLimit(chart)
  const decade = limit.decade
  if (!decade) {
    drawFortuneTitle(
      p,
      "大限",
      `${chart.bureau.name}，${chart.bureau.number} 岁起限，今年虚岁 ${limit.age} 尚未起限`
    )
    return
  }

  const palace = chart.palaces.find(
    (item) => item.decade.index === decade.index
  )
  drawFortuneTitle(
    p,
    `大限 ${palace?.sixtyCycle ?? ""}`,
    `${palace?.name ?? ""}  ${decade.startAge}-${decade.endAge} 岁  ${decade.startYear}-${decade.endYear}  大限${chart.forward ? "顺" : "逆"}行`
  )

  drawChips(
    p,
    ziweiLimitYears(chart).map((flow) => ({
      title: flow.sixtyCycle,
      lines: [
        `${flow.age} 岁  ${flow.year}`,
        `命宫 ${flow.lifePalace}`,
        `小限 ${flow.minorLimit}`,
      ],
      current: flow.year === limit.yearly.year,
    })),
    5
  )
}

/** 表格：各列等宽，首行加粗，行间细线 */
function drawTable(p: Painter, rows: Run[][][]) {
  const { palette } = p
  const columns = Math.max(...rows.map((row) => row.length))
  const gap = 12
  const columnWidth = (CONTENT - gap * (columns - 1)) / columns
  const size = 13
  const lineHeight = 20

  rows.forEach((row, index) => {
    const cells = row.map((cell) =>
      p.wrapRuns(
        index === 0 ? cell.map((run) => ({ ...run, bold: true })) : cell,
        columnWidth,
        size,
        SANS
      )
    )
    const height = Math.max(1, ...cells.map((cell) => cell.length)) * lineHeight
    const top = p.y
    cells.forEach((cell, i) => {
      p.y = top + 6
      p.lines(
        cell,
        PADDING + i * (columnWidth + gap),
        size,
        SANS,
        palette.foreground,
        lineHeight
      )
    })
    p.y = top + height + 12
    p.rule()
  })
}

/** 解读正文，按块排版 */
function drawAnalysis(p: Painter, blocks: Block[]) {
  const { palette } = p
  p.font(11, SANS, 600)
  p.spacing("0.15em")
  p.text("命理解读", PADDING, p.y + 6, palette.mutedForeground)
  p.spacing("0px")
  p.y += 30

  blocks.forEach((block, index) => {
    const previous = blocks[index - 1]
    switch (block.kind) {
      case "heading": {
        if (previous) p.y += 14
        const size = block.level <= 2 ? 17 : 15
        const runs = block.runs.map((run) => ({ ...run, bold: true }))
        p.paragraph(
          runs,
          PADDING,
          CONTENT,
          size,
          HEADING,
          palette.foreground,
          size + 10
        )
        p.y += 6
        break
      }
      case "paragraph":
        if (previous?.kind === "item") p.y += 8
        p.paragraph(
          block.runs,
          PADDING,
          CONTENT,
          BODY_SIZE,
          SANS,
          palette.foreground,
          BODY_LINE
        )
        p.y += 10
        break
      case "item": {
        const indent = PADDING + block.depth * 18
        let textX = indent + 18
        if (block.marker) {
          p.font(13, SANS)
          textX = indent + Math.max(18, p.width(block.marker) + 8)
          p.text(
            block.marker,
            indent,
            p.y + BODY_LINE / 2,
            palette.mutedForeground
          )
        } else {
          p.circle(indent + 5, p.y + BODY_LINE / 2, 2, palette.mutedForeground)
        }
        p.paragraph(
          block.runs,
          textX,
          CONTENT - (textX - PADDING),
          BODY_SIZE,
          SANS,
          palette.foreground,
          BODY_LINE
        )
        p.y += 4
        break
      }
      case "quote": {
        const top = p.y
        p.paragraph(
          block.runs,
          PADDING + 14,
          CONTENT - 14,
          BODY_SIZE,
          SANS,
          palette.mutedForeground,
          BODY_LINE
        )
        p.rect(PADDING, top + 2, 2, p.y - top - 4, palette.border)
        p.y += 10
        break
      }
      case "rule":
        p.y += 6
        p.rule()
        p.y += 16
        break
      case "table":
        p.y += 4
        drawTable(p, block.rows)
        p.y += 14
        break
    }
  })
}

/** 二维码始终黑白，扫码稳定 */
function drawQr(
  p: Painter,
  content: string,
  x: number,
  y: number,
  size: number
) {
  const qr = encode(content, { border: 0, ecc: "M" })
  const pad = 6
  const cell = (size - pad * 2) / qr.size
  p.rect(x, y, size, size, "#fff")
  qr.data.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) {
        p.rect(
          x + pad + c * cell,
          y + pad + r * cell,
          cell + 0.2,
          cell + 0.2,
          "#000"
        )
      }
    })
  })
}

/** 左侧二维码与链接，右侧品牌 */
function drawFooter(p: Painter, shareUrl?: string) {
  const { palette } = p
  const top = p.y
  const qrSize = 104
  const height = shareUrl ? qrSize : 36

  if (shareUrl) {
    drawQr(p, shareUrl, PADDING, top, qrSize)
    const textX = PADDING + qrSize + 20
    p.font(14, SANS, 600)
    p.text("扫码查看完整命盘与解读", textX, top + 30, palette.foreground)
    p.font(12, SANS)
    let y = top + 58
    for (const line of p.wrap(shareUrl, CONTENT - qrSize - 20 - 110, 2)) {
      p.text(line, textX, y, palette.mutedForeground)
      y += 20
    }
  }

  const brandY = top + height / 2
  p.font(22, HEADING, 500)
  p.text("遇见", WIDTH - PADDING, brandY - 9, palette.foreground, "right")
  p.font(10, HEADING, 600)
  p.spacing("0.25em")
  p.text(
    "KISMET",
    WIDTH - PADDING,
    brandY + 13,
    palette.mutedForeground,
    "right"
  )
  p.spacing("0px")

  p.y = top + height
}

/** 从头到尾画一遍，返回总高度；dry 模式下只量尺寸 */
function paint(
  p: Painter,
  subject: PosterSubject,
  blocks: Block[],
  shareUrl?: string
): number {
  p.y = PADDING
  drawHeader(p, subject)
  p.section()
  if (subject.system === "bazi") {
    drawPillars(p, subject.chart)
    p.section()
    drawElements(p, subject.chart)
    p.section()
    drawBaziFortune(p, subject.chart)
  } else {
    drawPalaces(p, subject.chart)
    p.section()
    drawZiweiLimit(p, subject.chart)
  }
  if (blocks.length > 0) {
    p.section()
    drawAnalysis(p, blocks)
  }
  p.section()
  drawFooter(p, shareUrl)
  return p.y + PADDING
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("生成图片失败"))),
      "image/png"
    )
  })
}

/** 把命盘与解读画成长图，返回 PNG */
export async function renderPoster(
  subject: PosterSubject,
  options: PosterOptions = {}
): Promise<Blob> {
  const analysis = options.analysis?.trim() || undefined
  const blocks = analysis ? parseMarkdown(analysis) : []
  await loadFonts(textOf(subject, analysis, options.shareUrl))
  const palette = readPalette()

  const height = paint(
    new Painter(context(document.createElement("canvas")), palette, true),
    subject,
    blocks,
    options.shareUrl
  )

  // 倍率以 2 为上限，长图按总像素上限往下压
  const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (WIDTH * height)))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(WIDTH * scale)
  canvas.height = Math.round(height * scale)
  const ctx = context(canvas)
  ctx.scale(scale, scale)

  const p = new Painter(ctx, palette, false)
  p.rect(0, 0, WIDTH, height, palette.background)
  paint(p, subject, blocks, options.shareUrl)
  return toBlob(canvas)
}
