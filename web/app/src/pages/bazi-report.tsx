import * as React from "react"
import {
  RiArrowLeftLine,
  RiBookmarkFill,
  RiBookmarkLine,
} from "@remixicon/react"
import { Link, Navigate } from "react-router"

import { AnalysisPanel } from "@/components/analysis-panel"
import { useBaziSession } from "@/components/bazi-session"
import { ChartView } from "@/components/chart-view"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { paipan } from "@kismet/core"
import type { Chart } from "@kismet/core"
import { toPaipanInput } from "@/lib/bazi"
import { deleteReport, saveReport, useReports } from "@/lib/reports"

/**
 * 报告页：排盘结果与命理解读，表单值来自会话存储
 *
 * 头部的收藏开关把整份报告存进收藏；解读结束后自动收藏并更新正文
 */
export function BaziReportPage() {
  const [session] = useBaziSession()
  const reportId = session.reportId || String(session.submittedAt)
  const saved = useReports().find((r) => r.id === reportId)
  // 面板里最新的解读正文，点收藏时随报告一起存
  const latest = React.useRef(saved?.analysis ?? "")

  const result = React.useMemo<
    { chart: Chart; error?: undefined } | { chart?: undefined; error: string }
  >(() => {
    const input = toPaipanInput(session.birth)
    if (!input) return { error: "请先填写出生时间与性别" }
    try {
      return { chart: paipan(input, session.options) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [session.birth, session.options])

  if (!session.submittedAt) return <Navigate to="/bazi" replace />

  const save = (analysis: string) =>
    saveReport({
      id: reportId,
      savedAt: Date.now(),
      birth: session.birth,
      options: session.options,
      analysis,
    })

  const complete = (text: string) => {
    latest.current = text
    save(text)
  }

  const toggle = () => (saved ? deleteReport(reportId) : save(latest.current))

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            Four Pillars
          </span>
          <h1 className="font-serif text-2xl tracking-wide">八字命理</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={!!saved}
            onClick={toggle}
          >
            {saved ? (
              <RiBookmarkFill data-icon="inline-start" />
            ) : (
              <RiBookmarkLine data-icon="inline-start" />
            )}
            {saved ? "已收藏" : "收藏"}
          </Button>
          <Link
            to="/bazi"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RiArrowLeftLine data-icon="inline-start" />
            返回修改
          </Link>
        </div>
      </div>

      {result.chart ? (
        <>
          <ChartView chart={result.chart} />
          <Separator />
          <AnalysisPanel
            key={session.submittedAt}
            chart={result.chart}
            initialText={saved?.analysis}
            onComplete={complete}
          />
        </>
      ) : (
        <p className="text-sm text-destructive">{result.error}</p>
      )}
    </section>
  )
}
