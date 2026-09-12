import * as React from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChartView } from "@/components/chart-view"
import { Separator } from "@/components/ui/separator"
import { ZiweiChartView } from "@/components/ziwei-chart-view"
import { baziPaipan, ziweiPaipan } from "@kismet/core"
import type { BaziOptions, PaipanInput, ZiweiOptions } from "@kismet/core"
import { errorMessage } from "@/lib/api"
import { formatSavedAt } from "@/lib/reports"
import type { ReportOptions, System } from "@/lib/system"

interface ReportViewProps {
  system: System
  input: PaipanInput
  options: ReportOptions
  /** 解读正文 Markdown，空即尚未解读 */
  analysis: string
  /** 报告最近一次更新的时间，ISO 字符串 */
  updatedAt: string
  /** 隐去出生时刻、出生地与农历日期，分享页用 */
  hideBirth?: boolean
}

type Rendered =
  | { node: React.ReactNode; error?: undefined }
  | { node?: undefined; error: string }

/** 按体系在本地重新排盘并渲染命盘 */
function renderChart(
  system: System,
  input: PaipanInput,
  options: ReportOptions,
  hideBirth?: boolean
): Rendered {
  try {
    if (system === "ziwei") {
      return {
        node: (
          <ZiweiChartView
            chart={ziweiPaipan(input, options as ZiweiOptions)}
            hideBirth={hideBirth}
          />
        ),
      }
    }
    return {
      node: (
        <ChartView
          chart={baziPaipan(input, options as BaziOptions)}
          hideBirth={hideBirth}
        />
      ),
    }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

/** 服务端保存的报告：按体系、输入与选项在本地重新排盘，下面接保存的解读 */
export function ReportView({
  system,
  input,
  options,
  analysis,
  updatedAt,
  hideBirth,
}: ReportViewProps) {
  const rendered = React.useMemo(
    () => renderChart(system, input, options, hideBirth),
    [system, input, options, hideBirth]
  )

  if (rendered.error !== undefined) {
    return <p className="text-sm text-destructive">{rendered.error}</p>
  }

  return (
    <>
      {rendered.node}
      <Separator />
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg">命理解读</h3>
          <span className="text-xs text-muted-foreground">
            更新于 {formatSavedAt(Date.parse(updatedAt))}
          </span>
        </div>
        {analysis ? (
          <div className="markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{analysis}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未解读</p>
        )}
      </section>
    </>
  )
}
