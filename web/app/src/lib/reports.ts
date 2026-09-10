/**
 * 收藏的报告：表单值、选项与解读正文存进 localStorage，收藏页随时可打开
 */

import { useSyncExternalStore } from "react"

import type { PaipanOptions } from "@kismet/core"
import type { BirthInfo } from "@/lib/birth-info"

export interface SavedReport {
  /** 提交表单时生成，同一份报告重新解读会覆盖 */
  id: string
  /** 最近一次保存的时间戳 */
  savedAt: number
  birth: BirthInfo
  options: PaipanOptions
  /** 解读正文 Markdown，尚未解读时为空 */
  analysis: string
}

const STORAGE_KEY = "kismet.bazi.reports"

/** 最多保留的份数，超出时丢弃最早保存的 */
const LIMIT = 50

let cache: SavedReport[] | undefined
const listeners = new Set<() => void>()

function byNewest(a: SavedReport, b: SavedReport): number {
  return b.savedAt - a.savedAt
}

/** 读全部报告，最近保存的在前；结果缓存到下次写入 */
function read(): SavedReport[] {
  if (cache) return cache
  cache = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) cache = (JSON.parse(raw) as SavedReport[]).sort(byNewest)
  } catch {
    // 存储不可用或内容损坏，视为没有报告
  }
  return cache
}

function write(reports: SavedReport[]) {
  cache = reports.sort(byNewest)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // 存储不可用或已满，本次只保留在内存里
  }
  for (const notify of listeners) notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 报告 id，时间戳加随机串，不依赖安全上下文 */
export function newReportId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 订阅全部报告，保存或删除后自动刷新 */
export function useReports(): SavedReport[] {
  return useSyncExternalStore(subscribe, read)
}

/** 新增或覆盖同 id 的报告 */
export function saveReport(report: SavedReport) {
  const rest = read().filter((r) => r.id !== report.id)
  write([report, ...rest].slice(0, LIMIT))
}

export function deleteReport(id: string) {
  write(read().filter((r) => r.id !== id))
}

/** 保存时间的显示格式，如 `2026-09-10 14:22` */
export function formatSavedAt(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
