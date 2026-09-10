/**
 * 命理解读：拼提示词，经 Go 服务请求 DeepSeek 流式输出
 */

import { toText } from "@kismet/core"
import type { Chart } from "@kismet/core"

import { API_BASE, readError } from "@/lib/api"

/** 把「今天」写进提示词，模型据此判断「这两年」指哪两年 */
function todayText(): string {
  const now = new Date()
  return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** 由排盘结果拼出解读提示词 */
export function buildAnalysisPrompt(chart: Chart): string {
  const i = chart.input
  const birth = `${i.year} 年 ${i.month} 月 ${i.day} 日 ${pad(i.hour)}:${pad(i.minute)}`
  const who = chart.name ? ` ${chart.name} ` : ""
  const place = chart.location?.name ?? "不详"
  const gender = chart.gender === "male" ? "男" : "女"
  const text = toText(chart, { years: true })

  return [
    "你是一位精通传统命理与现代运势分析的大师。",
    `我${who}出生于阳曆 ${birth}，地点为 ${place}，性別 ${gender}。`,
    "这是我用专业排盘软件得出的文字命盘/八字结构：",
    text,
    "",
    `今天是 ${todayText()}。`,
    "",
    "请不要给模糊的安慰话，请直接客观地告诉我：",
    "- 我命格里最强的优势与最致命的盲点。",
    "- 我这两年的事业、财富与感情走势。",
    "- 给我具体、可执行的开运或避坑建议。",
  ].join("\n")
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
 * 服务端逐行转发 DeepSeek 的 SSE，这里解析 `data:` 载荷，遇到 `[DONE]` 结束。
 * 思考模式下正文之前先有一段 `reasoning_content`，只用来通知调用方模型在思考
 */
export async function streamAnalysis(
  prompt: string,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  onReasoning?: () => void
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
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
