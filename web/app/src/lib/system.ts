/**
 * 命理体系：页面、卡片与接口按它取文案与路径
 */

import type { BaziOptions, ZiweiOptions } from "@kismet/core"

export type System = "bazi" | "ziwei"

export interface SystemMeta {
  /** 拉丁小字眉题，如 `Four Pillars` */
  eyebrow: string
  title: string
  /** 表单页路径 */
  path: string
  /** 报告页路径 */
  reportPath: string
}

export const SYSTEMS: Record<System, SystemMeta> = {
  bazi: {
    eyebrow: "Four Pillars",
    title: "八字命理",
    path: "/bazi",
    reportPath: "/bazi/report",
  },
  ziwei: {
    eyebrow: "Purple Star",
    title: "紫微斗数",
    path: "/ziwei",
    reportPath: "/ziwei/report",
  },
}

/** 某份报告的报告页地址，如 `/bazi/report/<id>` */
export function reportPathOf(system: System, id: string): string {
  return `${SYSTEMS[system].reportPath}/${id}`
}

export function isSystem(value: unknown): value is System {
  return value === "bazi" || value === "ziwei"
}

/** 体系未知时的占位展示信息 */
const UNKNOWN_SYSTEM: SystemMeta = {
  eyebrow: "Unknown System",
  title: "未知体系",
  path: "/",
  reportPath: "/",
}

/** 取体系的展示信息，值不合法时返回未知体系的占位信息而不抛错 */
export function systemMetaOf(value: unknown): SystemMeta {
  return isSystem(value) ? SYSTEMS[value] : UNKNOWN_SYSTEM
}

/** 服务端原样透传的排盘选项，按 `system` 判别具体类型 */
export type ReportOptions = BaziOptions | ZiweiOptions
