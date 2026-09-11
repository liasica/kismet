/**
 * 命宫、身宫、宫干与五行局
 */

import type { FiveElement } from "../birth/types"
import { BUREAU_NAME, BUREAU_NUMBER, mod, NAYIN_ELEMENTS } from "./data/tables"
import type { Bureau } from "./types"

/** 寅宫起正月顺数至生月，再从该宫起子时逆数至生时 */
export function lifePalaceOf(month: number, hour: number): number {
  return mod(2 + (month - 1) - hour, 12)
}

/** 生月所到之宫起子时顺数至生时 */
export function bodyPalaceOf(month: number, hour: number): number {
  return mod(2 + (month - 1) + hour, 12)
}

/**
 * 五虎遁：由年干定寅宫天干，其余宫顺推
 *
 * 甲己之年丙遁寅、乙庚戊、丙辛庚、丁壬壬、戊癸甲；子丑两宫接在亥之后
 */
export function palaceStemOf(yearStem: number, branch: number): number {
  const yinStem = (yearStem % 5) * 2 + 2
  return (yinStem + mod(branch - 2, 12)) % 10
}

/** 干支的纳音五行 */
export function nayinElementOf(stem: number, branch: number): FiveElement {
  return NAYIN_ELEMENTS[Math.floor(stem / 2)]![Math.floor((branch % 6) / 2)]!
}

/** 命宫干支的纳音定五行局 */
export function bureauOf(stem: number, branch: number): Bureau {
  const element = nayinElementOf(stem, branch)
  const number = BUREAU_NUMBER[element]
  return { name: BUREAU_NAME[number]!, element, number }
}
