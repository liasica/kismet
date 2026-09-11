/**
 * 八字模块的默认选项与配色
 */

import type { BaziOptions, FiveElement } from "@kismet/core"

/** 五行对应的文字色，天干地支按所属五行着色 */
export const ELEMENT_TEXT: Record<FiveElement, string> = {
  木: "text-wood",
  火: "text-fire",
  土: "text-earth",
  金: "text-metal",
  水: "text-water",
}

export const INITIAL_BAZI_OPTIONS: BaziOptions = {
  useTrueSolarTime: true,
  useDaylightSaving: false,
  lateZiAsNextDay: false,
  qiYunPrecision: "hour",
  shenShaSkipBasePillar: false,
  maxAge: 100,
  elementStrategy: "weighted",
}
