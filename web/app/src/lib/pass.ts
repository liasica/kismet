/**
 * 通行码：后台生成发给用户，解读请求带上它就不受免费次数的两层额度限制
 *
 * 码存在浏览器本地，每次解读都带上；不限次的码一直有效，次数码每解读一次扣一次，
 * 扣完失效。服务端判定码不能用时在响应里带 `pass_invalid`，前端据此清掉本地这一份
 */

import { useSyncExternalStore } from "react"

import { adminJSON } from "@/lib/admin"
import { API_BASE, readError } from "@/lib/api"
import type { Tokens } from "@/lib/usage"

/** 码的两种类型：不限次与按次数 */
export type PassKind = "allow" | "times"

/** 服务端说码不能用时响应里带的标识 */
export const PASS_INVALID = "pass_invalid"

/** 服务端说免费次数不够时响应里带的标识，界面据此提示填通行码 */
export const QUOTA_EXHAUSTED = "quota_exhausted"

/** 码里用到的字符，去掉了容易看混的 0O1IL */
const ALPHABET = /[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g

/** 一把码对外的样子 */
export interface PassInfo {
  code: string
  kind: PassKind
  /** 次数池的总数，不限次的码为 0 */
  times: number
  used: number
  /** 剩余次数，不限次的码为 -1 */
  left: number
  /** 当下能不能用 */
  valid: boolean
  /** 不能用的缘由，能用时没有 */
  reason?: string
}

/** 后台列表里的一把码，比用户查码多出备注、用量与用过它的客户端 */
export interface AdminPass extends PassInfo {
  note?: string
  disabled: boolean
  createdAt: string
  /** 最近一次用它解读的时刻，没用过是零值时间 */
  lastAt: string
  lastIp?: string
  lastUserAgent?: string
  /** 用过它的客户端主体键，去重 */
  clients?: string[]
  tokens: Tokens
}

export interface AdminPassPage {
  total: number
  passes: AdminPass[]
}

/** 生成通行码的参数 */
export interface PassDraft {
  kind: PassKind
  /** 次数码的次数池大小 */
  times: number
  /** 这次生成几把 */
  count: number
  note: string
}

/** 列表每页条数 */
export const PASS_PAGE_SIZE = 20

/** 规范化用户输入的码：丢掉分隔符与空白，小写转大写 */
export function normalizePassCode(raw: string): string {
  return raw.toUpperCase().replace(ALPHABET, "")
}

/** 四位一组用短横分开，给人抄的写法 */
export function formatPassCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code
}

/** 码的类型说法 */
export function passKindLabel(kind: PassKind): string {
  return kind === "allow" ? "不限次" : "按次数"
}

/** 一把码剩余额度的说法 */
export function passLeftLabel(info: PassInfo): string {
  if (info.kind === "allow") return "不限次"
  return `剩 ${info.left} / ${info.times} 次`
}

/** 查一把码的类型与剩余次数，码不存在时返回 `undefined` */
export async function fetchPass(code: string): Promise<PassInfo | undefined> {
  const res = await fetch(`${API_BASE}/api/passes/${normalizePassCode(code)}`)
  if (res.status === 403 || res.status === 404) return undefined
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as PassInfo
}

/** 分页列出全部通行码，最近生成的在前，`page` 从 1 起 */
export function fetchAdminPasses(
  password: string,
  page: number
): Promise<AdminPassPage> {
  const offset = (page - 1) * PASS_PAGE_SIZE
  return adminJSON<AdminPassPage>(
    `/api/admin/passes?offset=${offset}&limit=${PASS_PAGE_SIZE}`,
    password
  )
}

/** 生成一批通行码，返回新生成的那几把 */
export function createPasses(
  password: string,
  draft: PassDraft
): Promise<AdminPassPage> {
  return adminJSON<AdminPassPage>("/api/admin/passes", password, draft)
}

/** 作废或恢复一把码，返回它改动后的样子 */
export function setPassDisabled(
  password: string,
  code: string,
  disabled: boolean
): Promise<AdminPass> {
  return adminJSON<AdminPass>("/api/admin/passes/disable", password, {
    code,
    disabled,
  })
}

const STORAGE_KEY = "kismet.pass"

let cache: string | undefined
const listeners = new Set<() => void>()

/** 本地存着的通行码，没有则为空串 */
export function currentPass(): string {
  if (cache === undefined) {
    try {
      cache = localStorage.getItem(STORAGE_KEY) ?? ""
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

/** 订阅本地存着的通行码 */
export function usePass(): string {
  return useSyncExternalStore(subscribe, currentPass)
}

/** 记住一把通行码，传空串即移除 */
export function setPass(code: string) {
  cache = normalizePassCode(code)
  try {
    if (cache) localStorage.setItem(STORAGE_KEY, cache)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 存储不可用时只保留在内存里
  }
  for (const notify of listeners) notify()
}
