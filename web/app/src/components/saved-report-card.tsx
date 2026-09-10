import * as React from "react"
import { cn } from "cn"
import { RiDeleteBinLine } from "@remixicon/react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { paipan } from "@kismet/core"
import type { Chart, PillarKind } from "@kismet/core"
import { ELEMENT_TEXT, toPaipanInput } from "@/lib/bazi"
import { locationNameOf } from "@/lib/birth-info"
import { trackGlow } from "@/lib/glow"
import { excerptOf, formatSavedAt, type SavedReport } from "@/lib/reports"

const PILLARS: ReadonlyArray<[PillarKind, string]> = [
  ["year", "年"],
  ["month", "月"],
  ["day", "日"],
  ["hour", "时"],
]

/** 按保存的表单值重新排盘，输入不合法时卡片不显示四柱 */
function chartOf(report: SavedReport): Chart | undefined {
  const input = toPaipanInput(report.birth)
  if (!input) return undefined
  try {
    return paipan(input, report.options)
  } catch {
    return undefined
  }
}

interface SavedReportCardProps {
  report: SavedReport
  /** 在列表里的位置，进场动画按它错开 */
  index: number
  onOpen: (report: SavedReport) => void
  onDelete: (id: string) => void
}

/**
 * 收藏页的报告卡片：四柱八字为主体，按五行着色
 *
 * 整张卡片点开报告；删除分两步，第一下变成「确认删除」，三秒内不点第二下就还原
 */
export function SavedReportCard({
  report,
  index,
  onOpen,
  onDelete,
}: SavedReportCardProps) {
  const chart = React.useMemo(() => chartOf(report), [report])
  const [confirming, setConfirming] = React.useState(false)
  const name = report.birth.name || "未具名"
  const place = locationNameOf(report.birth)
  const excerpt = excerptOf(report.analysis)

  React.useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <article
      className="module-card group relative flex animate-in ring-1 ring-foreground/5 transition-[transform,box-shadow] duration-300 ease-out fill-mode-backwards fade-in slide-in-from-bottom-2 focus-within:ring-2 focus-within:ring-ring/50 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ animationDelay: `${index * 60}ms` }}
      onPointerMove={trackGlow}
    >
      <span className="module-card-glow" aria-hidden />
      <div className="relative m-px flex flex-1 flex-col gap-5 overflow-hidden bg-card p-6">
        <span className="module-card-light" aria-hidden />
        <Link
          to="/bazi/report"
          className="absolute inset-0 z-10 outline-none"
          aria-label={`打开 ${name} 的报告`}
          onClick={() => onOpen(report)}
        />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
              <Badge variant="secondary">
                {report.birth.gender === "male" ? "乾造" : "坤造"}
              </Badge>
              <span>
                {report.birth.date} {report.birth.time}
              </span>
            </span>
            <span className="font-heading text-xl">{name}</span>
            {place && (
              <span className="truncate text-xs text-muted-foreground">
                {place}
              </span>
            )}
          </div>
          <Button
            variant={confirming ? "destructive" : "ghost"}
            size={confirming ? "xs" : "icon-xs"}
            className={cn(
              "relative z-20 shrink-0 transition-opacity",
              !confirming &&
                "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            )}
            aria-label={confirming ? undefined : "删除这份收藏"}
            onClick={() =>
              confirming ? onDelete(report.id) : setConfirming(true)
            }
          >
            {confirming ? "确认删除" : <RiDeleteBinLine />}
          </Button>
        </div>

        {chart && (
          <div className="relative border-y border-border py-4">
            <div className="module-card-figure grid grid-cols-4">
              {PILLARS.map(([kind, label]) => {
                const p = chart.pillars[kind]
                return (
                  <span key={kind} className="flex flex-col items-center gap-2">
                    <span className="text-[0.625rem] text-muted-foreground">
                      {label}
                    </span>
                    <span
                      className={cn(
                        "font-serif text-2xl leading-none",
                        ELEMENT_TEXT[p.stemElement]
                      )}
                    >
                      {p.stem}
                    </span>
                    <span
                      className={cn(
                        "font-serif text-2xl leading-none",
                        ELEMENT_TEXT[p.branchElement]
                      )}
                    >
                      {p.branch}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div className="relative flex flex-1 flex-col justify-end gap-2 text-xs text-muted-foreground">
          <p className="line-clamp-2 min-h-[2lh] leading-relaxed">
            {excerpt ?? "尚未解读"}
          </p>
          <span>收藏于 {formatSavedAt(report.savedAt)}</span>
        </div>
      </div>
    </article>
  )
}
