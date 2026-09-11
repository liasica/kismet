import * as React from "react"
import { cn } from "cn"

import { ScrollRow } from "@/components/scroll-row"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  EARTH_BRANCHES,
  ziweiDecadeFlow,
  ziweiLimitAt,
  ziweiToText,
  ziweiYearly,
} from "@kismet/core"
import type {
  ZiweiChart,
  ZiweiFlow,
  ZiweiPalace,
  ZiweiStar,
  ZiweiYear,
} from "@kismet/core"
import { ELEMENT_TEXT } from "@/lib/bazi"
import { MUTATION_TEXT } from "@/lib/ziwei"

/** 十二宫在 4 x 4 网格里的列与行（从 1 起）：巳午未申一行、寅丑子亥一行，中央四格放命主信息 */
const GRID: Readonly<Record<string, readonly [number, number]>> = {
  巳: [1, 1],
  午: [2, 1],
  未: [3, 1],
  申: [4, 1],
  辰: [1, 2],
  酉: [4, 2],
  卯: [1, 3],
  戌: [4, 3],
  寅: [1, 4],
  丑: [2, 4],
  子: [3, 4],
  亥: [4, 4],
}

/** 叠在命盘上的运限：大限或流年的流曜 */
interface Overlay {
  /** 标在流四化前的字：大限「限」、流年「年」 */
  tag: string
  label: string
  flow: ZiweiFlow | ZiweiYear
}

function branchIndexOf(branch: string): number {
  return EARTH_BRANCHES.indexOf(branch as (typeof EARTH_BRANCHES)[number])
}

function isYearly(flow: ZiweiFlow | ZiweiYear): flow is ZiweiYear {
  return "suiQian" in flow
}

/** 一颗星：名字、小字的庙陷与生年四化，以及运限的流四化 */
function StarText({
  star,
  flowTag,
  className,
}: {
  star: ZiweiStar
  flowTag?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-px whitespace-nowrap",
        className
      )}
    >
      {star.name}
      {star.brightness && (
        <span className="text-[0.625rem] font-normal text-muted-foreground">
          {star.brightness}
        </span>
      )}
      {star.mutation && (
        <span
          className={cn(
            "text-[0.625rem] font-semibold",
            MUTATION_TEXT[star.mutation]
          )}
        >
          {star.mutation}
        </span>
      )}
      {flowTag && (
        <span className="text-[0.625rem] font-semibold text-primary">
          {flowTag}
        </span>
      )}
    </span>
  )
}

interface PalaceCellProps {
  chart: ZiweiChart
  palace: ZiweiPalace
  overlay?: Overlay
}

/** 一宫：正曜、辅佐煞、杂曜、流曜与底部的宫名干支；无正曜时注明借对宫 */
function PalaceCell({ chart, palace, overlay }: PalaceCellProps) {
  const [col, row] = GRID[palace.branch]!
  const index = branchIndexOf(palace.branch)
  const opposite = chart.palaces[(index + 6) % 12]!
  const flowStars =
    overlay?.flow.stars.filter((s) => s.branch === palace.branch) ?? []
  const flowTagOf = (name: string) => {
    const mutation = overlay?.flow.mutations.find(
      (m) => m.star === name
    )?.mutation
    return mutation && overlay ? overlay.tag + mutation : undefined
  }
  const isFlowLife = overlay?.flow.lifePalace === palace.branch
  const yearly = overlay && isYearly(overlay.flow) ? overlay.flow : undefined

  return (
    <div
      className={cn(
        "flex min-h-40 flex-col gap-1.5 border border-border p-2 text-xs",
        isFlowLife && "bg-primary/10 ring-1 ring-primary ring-inset"
      )}
      style={{ gridColumn: col, gridRow: row }}
    >
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-serif text-lg leading-tight">
        {palace.majorStars.length > 0 ? (
          palace.majorStars.map((s) => (
            <StarText key={s.name} star={s} flowTag={flowTagOf(s.name)} />
          ))
        ) : (
          <span className="text-sm text-muted-foreground">
            借{opposite.branch}：
            {opposite.majorStars.map((s) => s.name).join(" ") || "无"}
          </span>
        )}
      </div>

      {palace.minorStars.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm leading-tight">
          {palace.minorStars.map((s) => (
            <StarText key={s.name} star={s} flowTag={flowTagOf(s.name)} />
          ))}
        </div>
      )}

      {palace.adjectiveStars.length > 0 && (
        <div className="flex flex-wrap gap-x-1.5 leading-tight text-muted-foreground">
          {palace.adjectiveStars.map((s) => (
            <span key={s.name}>{s.name}</span>
          ))}
        </div>
      )}

      {overlay && (flowStars.length > 0 || yearly) && (
        <div className="flex flex-wrap gap-x-1.5 leading-tight text-primary">
          {flowStars.map((s) => (
            <span key={s.name}>{s.name}</span>
          ))}
          {yearly && <span>{yearly.suiQian[index]}</span>}
          {yearly && <span>{yearly.jiangQian[index]}</span>}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-0.5">
        <div className="flex justify-between text-[0.625rem] text-muted-foreground">
          <span>
            {palace.decade.startAge}-{palace.decade.endAge}
          </span>
          <span>
            {palace.changSheng} {palace.boShi}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1 font-semibold">
            {palace.name}
            {palace.isBodyPalace && (
              <span className="font-normal text-muted-foreground">身</span>
            )}
          </span>
          <span className="font-serif text-sm">{palace.sixtyCycle}</span>
        </div>
      </div>
    </div>
  )
}

/** 中央四格：命主信息与当前叠加的运限 */
function CenterCell({
  chart,
  overlay,
}: {
  chart: ZiweiChart
  overlay?: Overlay
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 border border-border p-4 text-center text-sm"
      style={{ gridColumn: "2 / span 2", gridRow: "2 / span 2" }}
    >
      <span className="font-heading text-xl">{chart.name || "未具名"}</span>
      <span className="text-xs text-muted-foreground">
        {chart.lunar.text} {chart.lunar.hourBranch}时
      </span>
      <span className="text-xs text-muted-foreground">
        {chart.yang ? "阳" : "阴"}
        {chart.gender === "male" ? "男" : "女"}，大限
        {chart.forward ? "顺" : "逆"}行
      </span>
      <span className="flex gap-4">
        <span>
          命宫 <span className="font-serif">{chart.lifePalace}</span>
        </span>
        <span>
          身宫 <span className="font-serif">{chart.bodyPalace}</span>
        </span>
      </span>
      <span
        className={cn(
          "font-serif text-2xl",
          ELEMENT_TEXT[chart.bureau.element]
        )}
      >
        {chart.bureau.name}
      </span>
      <span className="flex gap-4 text-xs text-muted-foreground">
        <span>命主 {chart.lifeMaster}</span>
        <span>身主 {chart.bodyMaster}</span>
      </span>
      <span className="flex flex-wrap justify-center gap-x-2 text-xs">
        {chart.mutations.map((m) => (
          <span key={m.mutation}>
            {m.star}
            <span className={cn("font-semibold", MUTATION_TEXT[m.mutation])}>
              {m.mutation}
            </span>
          </span>
        ))}
      </span>
      {overlay && <span className="text-xs text-primary">{overlay.label}</span>}
    </div>
  )
}

/** 十二宫格，窄屏横向滚动 */
function PalaceGrid({
  chart,
  overlay,
}: {
  chart: ZiweiChart
  overlay?: Overlay
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-2xl grid-cols-4 grid-rows-4">
        {chart.palaces.map((p) => (
          <PalaceCell
            key={p.branch}
            chart={chart}
            palace={p}
            overlay={overlay}
          />
        ))}
        <CenterCell chart={chart} overlay={overlay} />
      </div>
    </div>
  )
}

/** 大限与流年：选一步大限或其中一个流年，把流曜叠到宫格上 */
function LimitView({ chart }: { chart: ZiweiChart }) {
  const current = React.useMemo(() => {
    const today = new Date()
    return ziweiLimitAt(chart, {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    })
  }, [chart])
  const decades = React.useMemo(
    () => [...chart.palaces].sort((a, b) => a.decade.index - b.decade.index),
    [chart]
  )
  const [decadeIndex, setDecadeIndex] = React.useState(
    current.decade?.index ?? 0
  )
  const [year, setYear] = React.useState<number | undefined>(
    current.decade ? current.lunarYear : undefined
  )

  const palace = decades[decadeIndex]!
  const years = React.useMemo(() => {
    const out: ZiweiYear[] = []
    for (let y = palace.decade.startYear; y <= palace.decade.endYear; y++) {
      out.push(ziweiYearly(chart, y))
    }
    return out
  }, [chart, palace])

  const overlay: Overlay = React.useMemo(() => {
    if (year !== undefined) {
      const flow = ziweiYearly(chart, year)
      return {
        tag: "年",
        label: `流年 ${flow.year} 年${flow.sixtyCycle}，虚岁 ${flow.age}，命宫在${flow.lifePalace}，斗君${flow.douJun}，小限${flow.minorLimit}`,
        flow,
      }
    }
    const flow = ziweiDecadeFlow(chart, decadeIndex)
    return {
      tag: "限",
      label: `大限 ${flow.sixtyCycle}，${palace.decade.startAge} 到 ${palace.decade.endAge} 岁，命宫在${flow.lifePalace}`,
      flow,
    }
  }, [chart, decadeIndex, year, palace])

  const chip =
    "flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-md border px-3 py-2 text-xs transition-colors"
  const chipOn = "border-primary bg-primary/10"
  const chipOff = "border-border hover:bg-accent"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span>大限{chart.forward ? "顺" : "逆"}行</span>
          <span>
            {chart.bureau.name}，{chart.bureau.number} 岁起限
          </span>
          {current.decade ? (
            <span>
              今年虚岁 {current.age}，正行第 {current.decade.index + 1} 步大限
            </span>
          ) : (
            <span>今年虚岁 {current.age}，尚未起限</span>
          )}
        </div>
        <ScrollRow>
          {decades.map((p, i) => (
            <button
              key={p.branch}
              type="button"
              className={cn(chip, i === decadeIndex ? chipOn : chipOff)}
              onClick={() => {
                setDecadeIndex(i)
                setYear(undefined)
              }}
            >
              <span className="font-serif text-base">{p.sixtyCycle}</span>
              <span className="text-muted-foreground">{p.name}</span>
              <span className="text-muted-foreground">
                {p.decade.startAge}岁
              </span>
              <span className="text-muted-foreground">
                {p.decade.startYear}
              </span>
            </button>
          ))}
        </ScrollRow>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-x-4 text-xs text-muted-foreground">
          <span>流年</span>
          <span>
            {palace.sixtyCycle} 大限 {palace.decade.startYear}-
            {palace.decade.endYear}
          </span>
        </div>
        <ScrollRow>
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              className={cn(chip, y.year === year ? chipOn : chipOff)}
              onClick={() => setYear(y.year === year ? undefined : y.year)}
            >
              <span className="font-serif text-base">{y.sixtyCycle}</span>
              <span className="text-muted-foreground">{y.age}岁</span>
              <span className="text-muted-foreground">{y.year}</span>
              <span className="text-muted-foreground">命宫{y.lifePalace}</span>
            </button>
          ))}
        </ScrollRow>
      </div>

      <p className="text-xs text-muted-foreground">
        高亮的宫是{year !== undefined ? "流年" : "大限"}
        命宫，宫内主题色为流曜与岁前将前诸星，星名后的「
        {overlay.tag}禄」「{overlay.tag}忌」为流四化
      </p>
      <PalaceGrid chart={chart} overlay={overlay} />
    </div>
  )
}

export function ZiweiChartView({ chart }: { chart: ZiweiChart }) {
  const t = chart.time
  const text = React.useMemo(() => ziweiToText(chart), [chart])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-heading text-xl">{chart.name || "未具名"}</h2>
          <Badge variant="secondary">
            {chart.gender === "male" ? "乾造" : "坤造"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {chart.lunar.text} {chart.lunar.hourBranch}时 属{t.zodiac}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>阳历 {t.input}</span>
          {t.daylightSavingMinutes !== 0 && (
            <span>
              标准时 {t.standard}（夏令时回拨 {-t.daylightSavingMinutes} 分钟）
            </span>
          )}
          {chart.options.useTrueSolarTime && (
            <span>
              真太阳时 {t.effective}（经度差 {t.longitudeMinutes} 分，均时差{" "}
              {t.equationOfTimeMinutes} 分）
            </span>
          )}
          {chart.location?.name && (
            <span>
              出生地 {chart.location.name}，东经 {chart.location.longitude}
            </span>
          )}
          {chart.lunar.leap && (
            <span>
              闰{chart.lunar.month}月
              {chart.lunar.day > 15
                ? `十六起按 ${chart.lunar.effectiveMonth} 月安星`
                : "十五以前按本月安星"}
            </span>
          )}
        </div>
      </div>

      <Tabs defaultValue="palaces">
        <TabsList>
          <TabsTrigger value="palaces">命盘</TabsTrigger>
          <TabsTrigger value="limit">大限流年</TabsTrigger>
          <TabsTrigger value="text">文本</TabsTrigger>
        </TabsList>

        <TabsContent value="palaces" className="pt-4">
          <PalaceGrid chart={chart} />
        </TabsContent>

        <TabsContent value="limit" className="pt-4">
          <LimitView chart={chart} />
        </TabsContent>

        <TabsContent value="text" className="pt-4">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {text}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
