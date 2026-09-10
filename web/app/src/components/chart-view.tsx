import * as React from "react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { ScrollRow } from "@/components/scroll-row"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ELEMENT_KEY_ORDER,
  ELEMENT_NAMES,
  groupShenShaByPillar,
  monthsOfYear,
  PILLAR_LABELS,
  shortTenStar,
  toText,
} from "@kismet/core"
import type { Chart, FiveElement, Pillar, PillarKind } from "@kismet/core"
import { ELEMENT_TEXT } from "@/lib/bazi"

const KS: readonly PillarKind[] = ["year", "month", "day", "hour"]

/** 一行行标 */
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center py-1 text-xs tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

function GanZhi({
  char,
  element,
  className,
}: {
  char: string
  element: FiveElement
  className?: string
}) {
  return <span className={cn(ELEMENT_TEXT[element], className)}>{char}</span>
}

/** 四柱主表 */
function PillarTable({ chart }: { chart: Chart }) {
  const grouped = groupShenShaByPillar(chart.shenSha)
  const maxHide = Math.max(...KS.map((k) => chart.pillars[k].hideStems.length))
  const maxShenSha = Math.max(...KS.map((k) => grouped[k].length), 1)

  const cell = "flex flex-col items-center gap-1 py-2"

  const rows: Array<{
    label: string
    render: (p: Pillar, k: PillarKind) => React.ReactNode
  }> = [
    {
      label: "主星",
      render: (p, k) => (
        <span className="text-sm">
          {k === "day"
            ? chart.gender === "male"
              ? "元男"
              : "元女"
            : p.stemTenStar}
        </span>
      ),
    },
    {
      label: "干支",
      render: (p) => (
        <div className="flex flex-col items-center gap-1">
          <GanZhi
            char={p.stem}
            element={p.stemElement}
            className="text-4xl leading-none"
          />
          <GanZhi
            char={p.branch}
            element={p.branchElement}
            className="text-4xl leading-none"
          />
        </div>
      ),
    },
    {
      label: "藏干",
      render: (p) => (
        <div className="flex flex-col items-center gap-0.5 text-xs">
          {Array.from({ length: maxHide }, (_, i) => {
            const h = p.hideStems[i]
            return (
              <div key={i} className="flex h-4 items-center gap-1.5">
                {h && (
                  <>
                    <GanZhi char={h.stem} element={h.element} />
                    <span className="text-muted-foreground">{h.tenStar}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ),
    },
    {
      label: "星运",
      render: (p) => <span className="text-xs">{p.terrain}</span>,
    },
    {
      label: "自坐",
      render: (p) => <span className="text-xs">{p.selfTerrain}</span>,
    },
    {
      label: "空亡",
      render: (p) => (
        <span className="text-xs">{p.extraBranches.join("")}</span>
      ),
    },
    {
      label: "纳音",
      render: (p) => <span className="text-xs">{p.sound}</span>,
    },
    {
      label: "神煞",
      render: (_p, k) => (
        <div className="flex flex-col items-center gap-0.5 text-xs">
          {Array.from({ length: maxShenSha }, (_, i) => (
            <div
              key={i}
              className="flex h-4 items-center text-muted-foreground"
            >
              {grouped[k][i]?.name ?? ""}
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-md grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] gap-x-2">
        <RowLabel>日期</RowLabel>
        {KS.map((k) => (
          <div
            key={k}
            className="py-1 text-center text-xs text-muted-foreground"
          >
            {PILLAR_LABELS[k]}
          </div>
        ))}

        <div className="col-span-5 my-1 border-b border-border" />

        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <RowLabel>{row.label}</RowLabel>
            {KS.map((k) => (
              <div key={k} className={cell}>
                {row.render(chart.pillars[k], k)}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

/** 大运、流年、流月三级联动 */
function FortuneView({ chart }: { chart: Chart }) {
  const [decade, setDecade] = React.useState(0)
  const [yearIndex, setYearIndex] = React.useState(0)

  const current = chart.decades[decade]
  const years = current?.years ?? []
  const year = years[Math.min(yearIndex, years.length - 1)]
  const months = year ? monthsOfYear(chart, year.year) : []

  const chip =
    "flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-md border px-3 py-2 text-xs transition-colors"
  const chipOn = "border-primary bg-primary/10"
  const chipOff = "border-border hover:bg-accent"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span>{chart.qiYun.forward ? "顺排" : "逆排"}</span>
          <span>{chart.qiYun.text}</span>
          <span>起运 {chart.qiYun.startTime}</span>
          <span>
            折算依据 {chart.qiYun.term.name} {chart.qiYun.term.time}
          </span>
        </div>
        <ScrollRow>
          {chart.decades.map((d, i) => (
            <button
              key={d.index}
              type="button"
              className={cn(chip, i === decade ? chipOn : chipOff)}
              onClick={() => {
                setDecade(i)
                setYearIndex(0)
              }}
            >
              <span className="font-serif text-base">{d.sixtyCycle}</span>
              <span className="text-muted-foreground">
                {shortTenStar(d.stemTenStar)}/{shortTenStar(d.branchTenStar)}
              </span>
              <span className="text-muted-foreground">{d.startAge}岁</span>
              <span className="text-muted-foreground">{d.startYear}</span>
            </button>
          ))}
        </ScrollRow>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-x-4 text-xs text-muted-foreground">
          <span>流年</span>
          <span>
            {current?.sixtyCycle} 大运 {current?.startYear}-{current?.endYear}
          </span>
        </div>
        <ScrollRow>
          {years.map((y, i) => (
            <button
              key={y.year}
              type="button"
              className={cn(chip, i === yearIndex ? chipOn : chipOff)}
              onClick={() => setYearIndex(i)}
            >
              <span className="font-serif text-base">{y.sixtyCycle}</span>
              <span className="text-muted-foreground">
                {shortTenStar(y.stemTenStar)}/{shortTenStar(y.branchTenStar)}
              </span>
              <span className="text-muted-foreground">{y.age}岁</span>
              <span className="text-muted-foreground">{y.year}</span>
              <span className="text-muted-foreground">
                小运 {y.minorFortune}
              </span>
            </button>
          ))}
        </ScrollRow>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-x-4 text-xs text-muted-foreground">
          <span>流月</span>
          <span>{year?.year} 年，以节为界</span>
        </div>
        <ScrollRow>
          {months.map((m) => (
            <div
              key={m.termName}
              className={cn(chip, chipOff, "cursor-default")}
            >
              <span className="font-serif text-base">{m.sixtyCycle}</span>
              <span className="text-muted-foreground">
                {shortTenStar(m.stemTenStar)}/{shortTenStar(m.branchTenStar)}
              </span>
              <span className="text-muted-foreground">{m.termName}</span>
              <span className="text-muted-foreground">
                {m.termTime.slice(5, 10)}
              </span>
            </div>
          ))}
        </ScrollRow>
      </div>
    </div>
  )
}

const ELEMENT_BAR: Record<FiveElement, string> = {
  木: "bg-wood",
  火: "bg-fire",
  土: "bg-earth",
  金: "bg-metal",
  水: "bg-water",
}

function ElementView({ chart }: { chart: Chart }) {
  const e = chart.elements
  const max = Math.max(...Object.values(e.scores), 1)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {ELEMENT_KEY_ORDER.map((key) => {
          const el = ELEMENT_NAMES[key]
          return (
            <div key={key} className="flex items-center gap-3">
              <GanZhi char={el} element={el} className="w-5 text-lg" />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", ELEMENT_BAR[el])}
                  style={{ width: `${(e.scores[key] / max) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs tabular-nums">
                {e.scores[key]}
              </span>
              <span className="w-6 text-xs text-muted-foreground">
                {e.seasonalState[key]}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>
          日主{" "}
          <GanZhi
            char={chart.dayStem}
            element={chart.dayStemElement}
            className="text-base"
          />
          <span className={ELEMENT_TEXT[chart.dayStemElement]}>
            {chart.dayStemElement}
          </span>{" "}
          <Badge variant="secondary">{e.strength}</Badge>
        </span>
        <span className="flex flex-wrap gap-x-4 text-muted-foreground">
          <span>同类 {e.supportScore}</span>
          <span>异类 {e.opposeScore}</span>
          <span>合计 {e.total}</span>
          <span>策略 {e.strategy}</span>
        </span>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        {KS.map((k) => {
          const hits = chart.shenSha.filter((s) => s.pillar === k)
          return (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-xs text-muted-foreground">
                {PILLAR_LABELS[k]}
              </span>
              {hits.length === 0 ? (
                <span className="text-xs text-muted-foreground">无</span>
              ) : (
                hits.map((h) => (
                  <Badge
                    key={h.name}
                    variant="outline"
                    title={`${h.by} 见 ${h.matched}`}
                  >
                    {h.name}
                  </Badge>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChartView({ chart }: { chart: Chart }) {
  const t = chart.time
  const text = React.useMemo(
    () => toText(chart, { years: true, months: true, elementDetail: true }),
    [chart]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-heading text-xl">{chart.name || "未具名"}</h2>
          <Badge variant="secondary">
            {chart.gender === "male" ? "乾造" : "坤造"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t.lunar} 属{t.zodiac}
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
          <span>
            {t.prevJie.name} {t.prevJie.time} 起，下一节 {t.nextJie.name}{" "}
            {t.nextJie.time}
          </span>
        </div>
      </div>

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">基本盘</TabsTrigger>
          <TabsTrigger value="fortune">大运流年</TabsTrigger>
          <TabsTrigger value="element">五行神煞</TabsTrigger>
          <TabsTrigger value="text">文本</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="flex flex-col gap-6 pt-4">
          <PillarTable chart={chart} />
          <Separator />
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>
              胎元{" "}
              <span className="font-serif">{chart.extras.fetalOrigin}</span>
            </span>
            <span>
              胎息{" "}
              <span className="font-serif">{chart.extras.fetalBreath}</span>
            </span>
            <span>
              命宫 <span className="font-serif">{chart.extras.ownSign}</span>
            </span>
            <span>
              身宫 <span className="font-serif">{chart.extras.bodySign}</span>
            </span>
            <span className="text-muted-foreground">
              日柱{chart.pillars.day.ten}旬，空亡 {chart.emptyBranches.join("")}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="fortune" className="pt-4">
          <FortuneView chart={chart} />
        </TabsContent>

        <TabsContent value="element" className="pt-4">
          <ElementView chart={chart} />
        </TabsContent>

        <TabsContent value="text" className="pt-4">
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
            {text}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}
