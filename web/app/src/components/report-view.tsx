import * as React from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChartView } from "@/components/chart-view"
import { Separator } from "@/components/ui/separator"
import { baziPaipan } from "@kismet/core"
import type { BaziChart, PaipanInput, BaziOptions } from "@kismet/core"
import { errorMessage } from "@/lib/api"
import { formatSavedAt } from "@/lib/reports"

interface ReportViewProps {
  input: PaipanInput
  options: BaziOptions
  /** 解读正文 Markdown，空即尚未解读 */
  analysis: string
  /** 报告最近一次更新的时间，ISO 字符串 */
  updatedAt: string
}

/** 服务端保存的报告：按输入与选项在本地重新排盘，下面接保存的解读 */
export function ReportView({
  input,
  options,
  analysis,
  updatedAt,
}: ReportViewProps) {
  const result = React.useMemo<
    | { chart: BaziChart; error?: undefined }
    | { chart?: undefined; error: string }
  >(() => {
    try {
      return { chart: baziPaipan(input, options) }
    } catch (e) {
      return { error: errorMessage(e) }
    }
  }, [input, options])

  if (!result.chart) {
    return <p className="text-sm text-destructive">{result.error}</p>
  }

  return (
    <>
      <ChartView chart={result.chart} />
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
