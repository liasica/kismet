/**
 * 分享：报告在服务端的分享状态、开启与取消，以及按哈希查看分享
 *
 * 报告 id 只有排盘的人自己知道，持有 id 即可管理分享；分享哈希是另一串短随机数，
 * 出现在链接里，持有哈希的人只能查看
 */

import type { PaipanInput } from "@kismet/core"

import { API_BASE, readError } from "@/lib/api"
import type { RemoteReport } from "@/lib/report-api"
import type { ReportOptions, System } from "@/lib/system"

export interface ShareInfo {
  hash: string
  /** 是否设了密码 */
  locked: boolean
  createdAt: string
}

/** 分享出去的报告内容，与按 id 取回的报告同一份结构 */
export type SharedReport = RemoteReport

/** 查看分享的结果：设了密码且尚未验证时只有 `locked` */
export interface SharedView {
  locked: boolean
  report?: SharedReport
}

/** 开启分享时随请求带上的内容 */
export interface ShareRequest {
  system: System
  /** 报告尚未在服务端保存时据此建档 */
  input: PaipanInput
  options: ReportOptions
  /** 本地最新的解读正文，非空时写进服务端的报告 */
  analysis: string
  /** 为空即不设密码 */
  password: string
}

/** 分享页地址 */
export function shareUrlOf(hash: string): string {
  return `${location.origin}/s/${hash}`
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

/** 报告当前的分享状态，未分享返回 `undefined` */
export async function fetchShare(
  reportId: string
): Promise<ShareInfo | undefined> {
  const res = await fetch(`${API_BASE}/api/reports/${reportId}/share`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as ShareInfo
}

/** 开启分享或更新密码，已开启时哈希不变 */
export async function createShare(
  reportId: string,
  body: ShareRequest
): Promise<ShareInfo> {
  const res = await fetch(
    `${API_BASE}/api/reports/${reportId}/share`,
    jsonInit("POST", body)
  )
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as ShareInfo
}

/** 取消分享，链接随即失效 */
export async function revokeShare(reportId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reports/${reportId}/share`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await readError(res))
}

/** 按哈希查看分享，链接不存在返回 `undefined` */
export async function fetchShared(
  hash: string
): Promise<SharedView | undefined> {
  const res = await fetch(`${API_BASE}/api/shares/${hash}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as SharedView
}

/** 输入密码查看分享，密码不对时抛出接口的错误信息 */
export async function unlockShared(
  hash: string,
  password: string
): Promise<SharedReport> {
  const res = await fetch(
    `${API_BASE}/api/shares/${hash}/unlock`,
    jsonInit("POST", { password })
  )
  if (!res.ok) throw new Error(await readError(res))
  const view = (await res.json()) as SharedView
  if (!view.report) throw new Error("接口没有返回报告内容")
  return view.report
}
