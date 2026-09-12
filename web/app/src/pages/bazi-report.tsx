import * as React from "react"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiBookmarkFill,
  RiBookmarkLine,
} from "@remixicon/react"
import { Link, Navigate, useParams } from "react-router"

import { AnalysisPanel } from "@/components/analysis-panel"
import { useBaziSession } from "@/components/bazi-session"
import { ChartView } from "@/components/chart-view"
import { ShareDialog } from "@/components/share-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { baziPaipan } from "@kismet/core"
import type { BaziChart, BaziOptions } from "@kismet/core"
import type { AnalysisRecord } from "@/lib/analysis"
import { toPaipanInput } from "@/lib/birth-info"
import type { PosterSubject } from "@/lib/poster"
import { useRemoteReport } from "@/lib/report-api"
import { deleteReport, isReportId, saveReport, useReports } from "@/lib/reports"
import { reportPathOf, SYSTEMS } from "@/lib/system"

/**
 * 报告页：排盘结果与命理解读，地址末段是这份报告的 id
 *
 * 会话里就是这份报告时按表单值排盘，可收藏、可返回修改；换个标签页打开或解读中途断开后
 * 重新进来，会话里没有它，就按 id 取服务端存下的排盘输入与已生成的正文。
 * 头部的收藏开关把整份报告存进收藏，解读结束后自动收藏并更新正文
 */
export function BaziReportPage() {
  const { id = "" } = useParams()
  const [session] = useBaziSession()
  const remote = useRemoteReport(id)
  const saved = useReports().find((r) => r.id === id)
  // 面板里最新的解读正文，点收藏时随报告一起存，长图上排进正文
  const [analysis, setAnalysis] = React.useState(saved?.analysis ?? "")

  // 会话里是这份报告才有表单值，否则只能用服务端存下的排盘输入
  const local = session.submittedAt > 0 && session.reportId === id
  const stored = remote.kind === "ready" ? remote.report : undefined

  const result = React.useMemo<
    | { chart: BaziChart; error?: undefined }
    | { chart?: undefined; error: string }
  >(() => {
    const input = local ? toPaipanInput(session.birth) : stored?.input
    const options = local ? session.options : stored?.options
    if (!input || !options) return { error: "请先填写出生时间与性别" }
    try {
      return { chart: baziPaipan(input, options as BaziOptions) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [local, session.birth, session.options, stored])

  // 引用稳定，避免长图与解读面板的 effect 因父组件重渲染而重跑
  const subject = React.useMemo<PosterSubject | undefined>(
    () => (result.chart ? { system: "bazi", chart: result.chart } : undefined),
    [result.chart]
  )
  const record = React.useMemo<AnalysisRecord | undefined>(
    () =>
      result.chart
        ? {
            system: "bazi",
            reportId: id,
            input: result.chart.input,
            options: result.chart.options,
          }
        : undefined,
    [id, result.chart]
  )

  // 地址不带 id 时补上会话里的那一份
  if (!id) {
    return isReportId(session.reportId) ? (
      <Navigate to={reportPathOf("bazi", session.reportId)} replace />
    ) : (
      <Navigate to={SYSTEMS.bazi.path} replace />
    )
  }
  if (!isReportId(id)) return <Navigate to={SYSTEMS.bazi.path} replace />

  const save = (text: string) =>
    saveReport({
      id,
      system: "bazi",
      savedAt: Date.now(),
      birth: session.birth,
      options: session.options,
      analysis: text,
    })

  const complete = (text: string) => {
    setAnalysis(text)
    if (local) save(text)
  }

  const toggle = () => (saved ? deleteReport(id) : save(analysis))

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            {SYSTEMS.bazi.eyebrow}
          </span>
          <h1 className="font-serif text-2xl tracking-wide">
            {SYSTEMS.bazi.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {local && (
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
          )}
          {subject && (
            <ShareDialog reportId={id} subject={subject} analysis={analysis} />
          )}
          {local ? (
            // 带 edit 进表单页，表单页用本次报告的值初始化草稿
            <Link
              to={SYSTEMS.bazi.path}
              state={{ edit: true }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <RiArrowLeftLine data-icon="inline-start" />
              返回修改
            </Link>
          ) : (
            <Link
              to={SYSTEMS.bazi.path}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              我也排一盘
              <RiArrowRightLine data-icon="inline-end" />
            </Link>
          )}
        </div>
      </div>

      {result.chart && record ? (
        <>
          <ChartView chart={result.chart} />
          <Separator />
          {remote.kind === "loading" ? (
            <p className="text-sm text-muted-foreground">加载中</p>
          ) : (
            <AnalysisPanel
              key={`${id}:${session.submittedAt}`}
              record={record}
              initialText={saved?.analysis || stored?.analysis}
              onComplete={complete}
            />
          )}
        </>
      ) : remote.kind === "loading" ? (
        <p className="text-sm text-muted-foreground">加载中</p>
      ) : (
        <p className="text-sm text-destructive">
          {local ? result.error : "找不到这份报告，它可能还没有解读过"}
        </p>
      )}
    </section>
  )
}
