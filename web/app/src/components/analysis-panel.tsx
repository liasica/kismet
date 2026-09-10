import * as React from "react"
import { RiSparklingLine, RiStopLine } from "@remixicon/react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Button } from "@/components/ui/button"
import type { Chart } from "@kismet/core"
import { buildAnalysisPrompt, streamAnalysis } from "@/lib/analysis"

type Status = "idle" | "thinking" | "streaming" | "done" | "error"

interface AnalysisPanelProps {
  chart: Chart
  /** 报告 id，解读结果以此存到服务端 */
  reportId: string
  /** 已收藏的解读正文，有则直接展示 */
  initialText?: string
  /** 一次解读结束（含手动停止）且有正文时回调 */
  onComplete?: (text: string) => void
}

/**
 * 命理解读：把排盘结果交给 DeepSeek，流式渲染 Markdown 回复
 *
 * 换盘后由父组件换 `key` 重建，正在进行的请求随组件卸载中止
 */
export function AnalysisPanel({
  chart,
  reportId,
  initialText,
  onComplete,
}: AnalysisPanelProps) {
  const prompt = React.useMemo(() => buildAnalysisPrompt(chart), [chart])
  const [status, setStatus] = React.useState<Status>(
    initialText ? "done" : "idle"
  )
  const [text, setText] = React.useState(initialText ?? "")
  const [error, setError] = React.useState<string>()
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => abortRef.current?.abort(), [])

  const start = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setText("")
    setError(undefined)
    setStatus("streaming")
    let full = ""
    try {
      await streamAnalysis(
        prompt,
        { reportId, input: chart.input, options: chart.options },
        (delta) => {
          full += delta
          setStatus("streaming")
          setText((prev) => prev + delta)
        },
        controller.signal,
        () => setStatus("thinking")
      )
      if (controller.signal.aborted) return
      setStatus("done")
      if (full) onComplete?.(full)
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      setStatus("error")
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setStatus(text ? "done" : "idle")
    if (text) onComplete?.(text)
  }

  const busy = status === "thinking" || status === "streaming"

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-heading text-lg">命理解读</h3>
        {busy ? (
          <Button variant="outline" size="sm" onClick={stop}>
            停止
            <RiStopLine />
          </Button>
        ) : (
          <Button size="sm" onClick={() => void start()}>
            {status === "idle" ? "开始解读" : "重新解读"}
            <RiSparklingLine />
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "done" && !text && (
        <p className="text-sm text-muted-foreground">解读服务没有返回正文</p>
      )}

      {text && (
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          {status === "thinking" ? "思考中" : "解读中"}
        </p>
      )}
    </section>
  )
}
