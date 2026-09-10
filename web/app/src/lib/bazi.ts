/**
 * 八字模块的默认选项与输入组装
 */

import type { FiveElement, PaipanInput, PaipanOptions } from "@kismet/core"

import {
  birthplaceOf,
  locationNameOf,
  parseMoment,
  type BirthInfo,
} from "@/lib/birth-info"

/** 五行对应的文字色，天干地支按所属五行着色 */
export const ELEMENT_TEXT: Record<FiveElement, string> = {
  木: "text-wood",
  火: "text-fire",
  土: "text-earth",
  金: "text-metal",
  水: "text-water",
}

export const INITIAL_OPTIONS: PaipanOptions = {
  useTrueSolarTime: true,
  useDaylightSaving: false,
  lateZiAsNextDay: false,
  qiYunPrecision: "hour",
  shenShaSkipBasePillar: false,
  maxAge: 100,
  elementStrategy: "weighted",
}

/** 表单取值转排盘输入，出生时间或性别缺失返回 `undefined` */
export function toPaipanInput(info: BirthInfo): PaipanInput | undefined {
  const moment = parseMoment(info.date, info.time)
  if (!moment || !info.gender) return undefined
  const place = birthplaceOf(info)
  return {
    ...moment,
    gender: info.gender,
    name: info.name.trim() || undefined,
    location: locationNameOf(info),
    longitude: place?.lng,
    latitude: place?.lat,
  }
}
