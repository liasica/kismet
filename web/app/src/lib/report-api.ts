/**
 * 服务端保存的报告
 *
 * 解读开始前服务端按报告 id 存下排盘输入，流结束或客户端中途断开都会把已生成的正文写回同一份。
 * 报告页的地址带着 id，重新打开页面时按它取回排盘输入与正文
 */

import * as React from "react"

import type { PaipanInput } from "@kismet/core"

import { API_BASE, errorMessage, readError } from "@/lib/api"
import { isReportId } from "@/lib/reports"
import type { ReportOptions, System } from "@/lib/system"

/** 服务端保存的报告内容 */
export interface RemoteReport {
  system: System
  input: PaipanInput
  options: ReportOptions
  /** 解读正文 Markdown，尚未解读时为空 */
  analysis: string
  createdAt: string
  updatedAt: string
}

/** 按 id 取服务端保存的报告，没有这份报告返回 `undefined` */
export async function fetchReport(
  id: string
): Promise<RemoteReport | undefined> {
  const res = await fetch(`${API_BASE}/api/reports/${id}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as RemoteReport
}

/** 取报告的状态：`missing` 是服务端没有这份报告，尚未解读过的新报告就是这样 */
export type RemoteState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; report: RemoteReport }
  | { kind: "failed"; message: string }

/** 按 id 取服务端的报告，id 变了重新取 */
export function useRemoteReport(id: string): RemoteState {
  // 结果记着它属于哪个 id，换了 id 就算还没取回来，不必在 effect 里先改一次状态
  const [entry, setEntry] = React.useState<RemoteState & { id: string }>({
    kind: "loading",
    id,
  })

  React.useEffect(() => {
    if (!isReportId(id)) return
    let cancelled = false
    fetchReport(id)
      .then((report) => {
        if (cancelled) return
        setEntry(
          report ? { kind: "ready", report, id } : { kind: "missing", id }
        )
      })
      .catch((e) => {
        if (!cancelled) {
          setEntry({ kind: "failed", message: errorMessage(e), id })
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!isReportId(id)) return { kind: "missing" }
  return entry.id === id ? entry : { kind: "loading" }
}
