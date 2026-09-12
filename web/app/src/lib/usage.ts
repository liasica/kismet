/**
 * 免费解读次数的用量：后台按浏览器指纹与来源 IP 看各客户端用了多少次，可清零、拉黑或加白名单
 */

import { adminJSON } from "@/lib/admin"

/** 配额主体的类型：浏览器指纹或来源 IP */
export type UsageKind = "client" | "ip"

/** 后台对一个主体的处置，空即按额度限次 */
export type UsageRule = "" | "allow" | "block"

/** 一个配额主体的用量 */
export interface AdminUsage {
  /** 存储里的键，形如 `client:xxxx` 或 `ip:1.2.3.4` */
  key: string
  kind: UsageKind
  value: string
  /** 当前窗口内的次数 */
  recent: number
  /** 累计次数，不受窗口与清零影响 */
  total: number
  firstAt: string
  lastAt: string
  /** 最近一次调用的 UA */
  userAgent?: string
  /** 最近一次调用的来源 IP */
  ip?: string
  rule?: UsageRule
  note?: string
}

/** 生效中的额度，0 即该层不限次 */
export interface QuotaLimits {
  client: number
  ip: number
  windowHours: number
}

export interface AdminUsagePage {
  total: number
  items: AdminUsage[]
  limits: QuotaLimits
}

/** 用量列表每页条数 */
export const USAGE_PAGE_SIZE = 30

/** 分页列出各配额主体的用量，最近调用的在前，`page` 从 1 起 */
export function fetchUsage(
  password: string,
  page: number
): Promise<AdminUsagePage> {
  const offset = (page - 1) * USAGE_PAGE_SIZE
  return adminJSON<AdminUsagePage>(
    `/api/admin/usage?offset=${offset}&limit=${USAGE_PAGE_SIZE}`,
    password
  )
}

/** 清掉一个主体在窗口内的计数，返回它改动后的样子 */
export function resetUsage(
  password: string,
  key: string
): Promise<AdminUsage> {
  return adminJSON<AdminUsage>("/api/admin/usage/reset", password, { key })
}

/** 设置一个主体的处置，返回它改动后的样子 */
export function setUsageRule(
  password: string,
  key: string,
  rule: UsageRule,
  note = ""
): Promise<AdminUsage> {
  return adminJSON<AdminUsage>("/api/admin/usage/rule", password, {
    key,
    rule,
    note,
  })
}

/** 主体类型的中文说法 */
export function usageKindLabel(kind: UsageKind): string {
  return kind === "ip" ? "IP" : "浏览器"
}

/** 处置的中文说法 */
export function usageRuleLabel(rule: UsageRule | undefined): string {
  if (rule === "allow") return "不限次"
  if (rule === "block") return "已拉黑"
  return "按额度"
}

/** 指纹太长，列表里只显示头尾 */
export function shortFingerprint(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

/** 主体在列表里的写法：IP 原样，指纹缩写，由 IP 派生的说明来历 */
export function usageValueLabel(item: AdminUsage): string {
  if (item.kind === "ip") return item.value
  const derived = item.value.startsWith("ip-")
  return derived ? `无指纹 ${item.value.slice(3)}` : shortFingerprint(item.value)
}

/** 微信等内置浏览器的 UA 里也带 Chrome，放在前面先命中 */
const BROWSERS: Array<[RegExp, string]> = [
  [/MicroMessenger/, "微信"],
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const PLATFORMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
]

function matchFirst(ua: string, table: Array<[RegExp, string]>): string {
  for (const [pattern, name] of table) if (pattern.test(ua)) return name
  return ""
}

/** 从 UA 里认出浏览器与系统，认不出就截一段原文 */
export function browserLabel(ua: string | undefined): string {
  if (!ua) return "不详"
  const parts = [matchFirst(ua, BROWSERS), matchFirst(ua, PLATFORMS)].filter(
    Boolean
  )
  return parts.length > 0 ? parts.join(" · ") : ua.slice(0, 24)
}
