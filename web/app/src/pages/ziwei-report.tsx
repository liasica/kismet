import * as React from "react"
import {
  RiArrowLeftLine,
  RiBookmarkFill,
  RiBookmarkLine,
} from "@remixicon/react"
import { Link, Navigate } from "react-router"

import { AnalysisPanel } from "@/components/analysis-panel"
import { ShareDialog } from "@/components/share-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ZiweiChartView } from "@/components/ziwei-chart-view"
import { useZiweiSession } from "@/components/ziwei-session"
import { ziweiPaipan } from "@kismet/core"
import type { ZiweiChart } from "@kismet/core"
import type { AnalysisRecord } from "@/lib/analysis"
import { toPaipanInput } from "@/lib/birth-info"
import type { PosterSubject } from "@/lib/poster"
import { deleteReport, isReportId, saveReport, useReports } from "@/lib/reports"
import { SYSTEMS } from "@/lib/system"

/**
 * 紫微报告页：十二宫命盘与命理解读，表单值来自会话存储
 *
 * 头部的收藏开关把整份报告存进收藏，解读结束后自动收藏并更新正文；
 * 分享按钮生成链接或长图，解读结果本身由服务端在解读时保存
 */
export function ZiweiReportPage() {
  const [session] = useZiweiSession()
  const reportId = session.reportId
  const saved = useReports().find((r) => r.id === reportId)
  const [analysis, setAnalysis] = React.useState(saved?.analysis ?? "")

  const result = React.useMemo<
    | { chart: ZiweiChart; error?: undefined }
    | { chart?: undefined; error: string }
  >(() => {
    const input = toPaipanInput(session.birth)
    if (!input) return { error: "请先填写出生时间与性别" }
    try {
      return { chart: ziweiPaipan(input, session.options) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [session.birth, session.options])

  // 引用稳定，避免海报与解读面板的 effect 因父组件重渲染而重跑
  const subject = React.useMemo<PosterSubject | undefined>(
    () => (result.chart ? { system: "ziwei", chart: result.chart } : undefined),
    [result.chart]
  )
  const record = React.useMemo<AnalysisRecord | undefined>(
    () =>
      result.chart
        ? {
            system: "ziwei",
            reportId,
            input: result.chart.input,
            options: result.chart.options,
          }
        : undefined,
    [reportId, result.chart]
  )

  if (!session.submittedAt || !isReportId(reportId)) {
    return <Navigate to={SYSTEMS.ziwei.path} replace />
  }

  const save = (text: string) =>
    saveReport({
      id: reportId,
      system: "ziwei",
      savedAt: Date.now(),
      birth: session.birth,
      options: session.options,
      analysis: text,
    })

  const complete = (text: string) => {
    setAnalysis(text)
    save(text)
  }

  const toggle = () => (saved ? deleteReport(reportId) : save(analysis))

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            {SYSTEMS.ziwei.eyebrow}
          </span>
          <h1 className="font-serif text-2xl tracking-wide">
            {SYSTEMS.ziwei.title}
          </h1>
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
          {subject && (
            <ShareDialog
              reportId={reportId}
              subject={subject}
              analysis={analysis}
            />
          )}
          <Link
            to={SYSTEMS.ziwei.path}
            state={{ edit: true }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RiArrowLeftLine data-icon="inline-start" />
            返回修改
          </Link>
        </div>
      </div>

      {result.chart && record ? (
        <>
          <ZiweiChartView chart={result.chart} />
          <Separator />
          <AnalysisPanel
            key={session.submittedAt}
            record={record}
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
