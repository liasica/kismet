import * as React from "react"
import { RiSparklingLine, RiStopLine } from "@remixicon/react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { PassField } from "@/components/pass-field"
import { Button } from "@/components/ui/button"
import {
  AnalysisError,
  streamAnalysis,
  type AnalysisRecord,
} from "@/lib/analysis"
import { QUOTA_EXHAUSTED } from "@/lib/pass"

type Status = "idle" | "thinking" | "streaming" | "done" | "error"

interface AnalysisPanelProps {
  /** 体系、报告 id、排盘输入与选项 */
  record: AnalysisRecord
  /** 已收藏的解读正文，有则直接展示 */
  initialText?: string
  /** 一次解读结束（含手动停止）且有正文时回调 */
  onComplete?: (text: string) => void
}

/**
 * 命理解读：把排盘输入交给服务端，流式渲染 DeepSeek 的 Markdown 回复
 *
 * 换盘后由父组件换 `key` 重建，正在进行的请求随组件卸载中止
 */
export function AnalysisPanel({
  record,
  initialText,
  onComplete,
}: AnalysisPanelProps) {
  const [status, setStatus] = React.useState<Status>(
    initialText ? "done" : "idle"
  )
  const [text, setText] = React.useState(initialText ?? "")
  const [error, setError] = React.useState<string>()
  // 免费次数不够时自动展开通行码的输入框
  const [passOpen, setPassOpen] = React.useState(false)
  // 解读会扣掉通行码的次数，结束后让它重查剩余次数
  const [passReload, setPassReload] = React.useState(0)
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
        record,
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
      if (e instanceof AnalysisError && e.code === QUOTA_EXHAUSTED) {
        setPassOpen(true)
      }
      setError(e instanceof Error ? e.message : String(e))
      setStatus("error")
    } finally {
      setPassReload((count) => count + 1)
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

      <PassField
        open={passOpen}
        onOpenChange={setPassOpen}
        reload={passReload}
      />

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
