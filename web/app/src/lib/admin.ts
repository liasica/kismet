/**
 * 后台管理：持有管理密码的人查看服务端保存的全部报告
 *
 * 密码是服务端环境变量 ADMIN_PASSWORD 的值，前端只放在 sessionStorage，关掉标签页即失效；
 * 每次请求以 `Authorization: Bearer` 携带，服务端返回 401 时清掉本地的密码回到登录表单
 */

import { useSyncExternalStore } from "react"

import type { PaipanInput, PaipanOptions } from "@kismet/core"
import { API_BASE, readError } from "@/lib/api"
import type { ShareInfo } from "@/lib/share"

/** 列表里的一条报告，不带解读正文 */
export interface AdminReportSummary {
  id: string
  createdAt: string
  updatedAt: string
  input: PaipanInput
  /** 生成解读的模型名，尚未解读时没有 */
  model?: string
  /** 解读正文的字符数，0 即尚未解读 */
  analysisRunes: number
  share?: ShareInfo
}

/** 单份报告的全部内容 */
export interface AdminReport extends AdminReportSummary {
  options: PaipanOptions
  analysis: string
}

export interface AdminReportPage {
  total: number
  reports: AdminReportSummary[]
}

/** 列表每页条数 */
export const PAGE_SIZE = 20

/** 管理密码缺失或不正确 */
export class UnauthorizedError extends Error {}

const STORAGE_KEY = "kismet.admin.password"

let cache: string | undefined
const listeners = new Set<() => void>()

function read(): string {
  if (cache === undefined) {
    try {
      cache = sessionStorage.getItem(STORAGE_KEY) ?? ""
    } catch {
      cache = ""
    }
  }
  return cache
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 当前的管理密码，未登录为空串 */
export function useAdminPassword(): string {
  return useSyncExternalStore(subscribe, read)
}

/** 记住管理密码，传空串即退出 */
export function setAdminPassword(password: string) {
  cache = password
  try {
    if (password) sessionStorage.setItem(STORAGE_KEY, password)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 存储不可用时只保留在内存里
  }
  for (const notify of listeners) notify()
}

/** 请求头只收 ASCII 可见字符，密码里有别的字符时 fetch 会直接抛错 */
export function isHeaderSafe(password: string): boolean {
  return /^[\x21-\x7e]+$/.test(password)
}

/** 带管理密码请求后台接口，401 抛 `UnauthorizedError`，其余状态交给调用方 */
async function adminFetch(path: string, password: string): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${password}` },
  })
  if (res.status === 401) throw new UnauthorizedError(await readError(res))
  return res
}

/** 分页列出全部报告，最新创建的在前，`page` 从 1 起 */
export async function fetchAdminReports(
  password: string,
  page: number
): Promise<AdminReportPage> {
  const offset = (page - 1) * PAGE_SIZE
  const res = await adminFetch(
    `/api/admin/reports?offset=${offset}&limit=${PAGE_SIZE}`,
    password
  )
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as AdminReportPage
}

/** 单份报告的全部内容，不存在返回 `undefined` */
export async function fetchAdminReport(
  password: string,
  id: string
): Promise<AdminReport | undefined> {
  const res = await adminFetch(`/api/admin/reports/${id}`, password)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as AdminReport
}

/** 出生时刻的显示格式，如 `1990-05-03 12:30` */
export function formatBirth(input: PaipanInput): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${input.year}-${pad(input.month)}-${pad(input.day)}`
  return `${date} ${pad(input.hour)}:${pad(input.minute)}`
}
