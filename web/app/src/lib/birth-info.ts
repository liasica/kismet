/**
 * 出生信息：各命理模块共用的表单取值与解析
 *
 * 与组件分开放，组件文件只导出组件，避免破坏 React 的 fast refresh
 */

import type { Gender } from "@kismet/core"
import type { Region } from "@kismet/core/region"

export interface BirthInfo {
  name: string
  /** 未选为空串 */
  gender: Gender | ""
  /** `YYYY-MM-DD`，未选为空串 */
  date: string
  /** `HH:mm`，未选为空串 */
  time: string
  /** 出生地的层级路径，从省开始，末项即所选地点 */
  region: Region[]
}

export const INITIAL_BIRTH_INFO: BirthInfo = {
  name: "",
  gender: "",
  date: "",
  time: "",
  region: [],
}

export interface Moment {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export interface Day {
  year: number
  month: number
  day: number
}

export interface Clock {
  hour: number
  minute: number
}

/** 解析 `YYYY-MM-DD`，格式不合法返回 `undefined` */
export function parseDay(date: string): Day | undefined {
  const d = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date)
  if (!d) return undefined
  return { year: Number(d[1]), month: Number(d[2]), day: Number(d[3]) }
}

/** 解析 `HH:mm`，格式不合法返回 `undefined` */
export function parseClock(time: string): Clock | undefined {
  const t = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!t) return undefined
  return { hour: Number(t[1]), minute: Number(t[2]) }
}

/** 解析 `YYYY-MM-DD` 与 `HH:mm`，任一格式不合法返回 `undefined` */
export function parseMoment(date: string, time: string): Moment | undefined {
  const day = parseDay(date)
  const clock = parseClock(time)
  if (!day || !clock) return undefined
  return { ...day, ...clock }
}

/** 所选出生地的末级，未选返回 `undefined` */
export function birthplaceOf(info: BirthInfo): Region | undefined {
  return info.region.at(-1)
}

/** 出生地显示名，如「浙江省 杭州市 西湖区」 */
export function locationNameOf(info: BirthInfo): string | undefined {
  return info.region.length > 0
    ? info.region.map((r) => r.name).join(" ")
    : undefined
}
