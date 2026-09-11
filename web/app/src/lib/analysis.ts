/**
 * 命理解读：把排盘输入交给 Go 服务，服务端排盘、拼提示词并流式转发 DeepSeek 的回复
 */

import type { PaipanInput, BaziOptions } from "@kismet/core"

import { API_BASE, readError } from "@/lib/api"

/** 解读请求：报告 id、排盘输入与选项，服务端据此排盘并存成报告，解读结束后正文写回同一份 */
export interface AnalysisRecord {
  reportId: string
  input: PaipanInput
  options: BaziOptions
}

/** OpenAI 兼容的流式片段，只取要用的字段 */
interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null }
  }>
}

/**
 * 请求解读并逐段回调正文
 *
 * 服务端先把 `record` 存成报告，再逐行转发 DeepSeek 的 SSE，流结束后把正文写回报告；
 * 这里解析 `data:` 载荷，遇到 `[DONE]` 结束。
 * 思考模式下正文之前先有一段 `reasoning_content`，只用来通知调用方模型在思考
 */
export async function streamAnalysis(
  record: AnalysisRecord,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  onReasoning?: () => void
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/bazi/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal,
    })
  } catch (e) {
    if (signal.aborted) return
    throw new Error("无法连接解读服务，请确认接口服务已启动", { cause: e })
  }

  if (!res.ok) throw new Error(await readError(res))
  if (!res.body) throw new Error("解读服务没有返回内容")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const handleLine = (line: string): boolean => {
    if (!line.startsWith("data:")) return false
    const payload = line.slice(5).trim()
    if (payload === "[DONE]") return true
    if (!payload) return false
    const chunk = JSON.parse(payload) as StreamChunk
    const delta = chunk.choices?.[0]?.delta
    if (delta?.reasoning_content) onReasoning?.()
    if (delta?.content) onDelta(delta.content)
    return false
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let index: number
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "")
      buffer = buffer.slice(index + 1)
      if (handleLine(line)) return
    }
  }

  if (buffer.trim()) handleLine(buffer.trim())
}
