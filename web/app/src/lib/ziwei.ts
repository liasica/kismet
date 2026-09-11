/**
 * 紫微模块的默认选项与配色
 */

import type { ZiweiMutation, ZiweiOptions } from "@kismet/core"

export const INITIAL_ZIWEI_OPTIONS: ZiweiOptions = {
  useTrueSolarTime: true,
  useDaylightSaving: false,
  lateZiAsNextDay: false,
  maxAge: 100,
}

/** 四化标记的文字色 */
export const MUTATION_TEXT: Record<ZiweiMutation, string> = {
  禄: "text-wood",
  权: "text-fire",
  科: "text-water",
  忌: "text-destructive",
}
