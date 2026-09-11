/**
 * 收藏的报告：表单值、选项与解读正文存进 localStorage，收藏页随时可打开
 */

import { useSyncExternalStore } from "react"

import type { BaziOptions, ZiweiOptions } from "@kismet/core"
import type { BirthInfo } from "@/lib/birth-info"
import { isSystem } from "@/lib/system"

interface SavedReportBase {
  /** 提交表单时生成，同一份报告重新解读会覆盖 */
  id: string
  /** 最近一次保存的时间戳 */
  savedAt: number
  birth: BirthInfo
  /** 解读正文 Markdown，尚未解读时为空 */
  analysis: string
}

/** 收藏的报告，`system` 判别选项的具体类型 */
export type SavedReport =
  | (SavedReportBase & { system: "bazi"; options: BaziOptions })
  | (SavedReportBase & { system: "ziwei"; options: ZiweiOptions })

const STORAGE_KEY = "kismet.reports"

/** 只有八字时用的旧键，读到就迁到新键 */
const LEGACY_KEY = "kismet.bazi.reports"

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
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (raw) {
      cache = normalize((JSON.parse(raw) as SavedReport[]).sort(byNewest))
    }
  } catch {
    // 存储不可用或内容损坏，视为没有报告
  }
  return cache
}

/** 补上旧数据缺的体系、换掉不合服务端格式的 id，有改动或来自旧键就写回新键并删旧键 */
function normalize(reports: SavedReport[]): SavedReport[] {
  const fixed = reports.map((r) => {
    const raw = (r as Partial<SavedReport>).system
    const system = isSystem(raw) ? raw : "bazi"
    const id = isReportId(r.id) ? r.id : newReportId()
    return system === r.system && id === r.id
      ? r
      : ({ ...r, system, id } as SavedReport)
  })
  try {
    const legacy = localStorage.getItem(LEGACY_KEY) !== null
    if (legacy || fixed.some((r, i) => r !== reports[i])) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed))
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch {
    // 存储不可用时只保留在内存里
  }
  return fixed
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

/** 报告 id：128 位随机数的十六进制，服务端按同样的格式校验 */
export function newReportId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function isReportId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id)
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

/** 解读正文的第一段，去掉 Markdown 标记，用作摘要 */
export function excerptOf(markdown: string): string | undefined {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"))
    ?.replace(/[*_`>]/g, "")
}

/** 保存时间的显示格式，如 `2026-09-10 14:22` */
export function formatSavedAt(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
