/**
 * 安星
 *
 * 按《中州派紫微斗数初级讲义》的安星口诀直译。每颗星只依赖生年干支、
 * 安星所用的月份、生日、时支与命身宫，结果是星名到地支索引的映射，
 * 宫内的排列顺序由 `data/tables.ts` 的星曜清单决定
 */

import {
  BELL_START,
  FEI_LIAN,
  FIRE_START,
  GU_CHEN,
  GUA_SU,
  HUA_GAI,
  JIE_KONG_START,
  JIE_SHA,
  JIE_SHEN,
  LU_CUN,
  mod,
  PO_SUI,
  TIAN_CHU,
  TIAN_FU,
  TIAN_GUAN,
  TIAN_KUI,
  TIAN_MA,
  TIAN_WU,
  TIAN_YUE,
  TIAN_YUE_MONTH,
  XIAN_CHI,
} from "./data/tables"

export interface StarContext {
  yearStem: number
  yearBranch: number
  /** 安星所用的农历月，闰月归属已处理 */
  month: number
  day: number
  /** 时支索引 */
  hour: number
  lifePalace: number
  bodyPalace: number
  /** 阳男阴女为 `true` */
  forward: boolean
  /** 阳年生为 `true` */
  yang: boolean
  /** 局数 2 至 6 */
  bureau: number
}

/** 各类星曜的位置：星名到地支索引 */
export interface StarPositions {
  major: Record<string, number>
  minor: Record<string, number>
  adjective: Record<string, number>
}

/**
 * 安紫微
 *
 * 取最小的 k 使生日加 k 能被局数整除，商为从寅起数的宫数；
 * k 为奇数逆退 k 宫、偶数顺进 k 宫。书中「安紫微表」土五局十一日与火六局初九
 * 为印刷错误，以本算法为准
 */
export function ziweiBranchOf(bureau: number, day: number): number {
  let k = 0
  while ((day + k) % bureau !== 0) k++
  const quotient = (day + k) / bureau
  const base = mod(2 + quotient - 1, 12)
  return k % 2 === 1 ? mod(base - k, 12) : mod(base + k, 12)
}

/** 全部取模到 0 至 11 */
function normalize(raw: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(raw).map(([name, at]) => [name, mod(at, 12)])
  )
}

export function placeStars(ctx: StarContext): StarPositions {
  const {
    yearStem: ys,
    yearBranch: yb,
    month,
    day,
    hour,
    lifePalace,
    bodyPalace,
    forward,
    yang,
  } = ctx

  // 紫微逆布天机太阳武曲天同廉贞，天府以寅申轴对称，顺布太阴以下诸曜
  const zi = ziweiBranchOf(ctx.bureau, day)
  const fu = mod(4 - zi, 12)
  const major = normalize({
    紫微: zi,
    天机: zi - 1,
    太阳: zi - 3,
    武曲: zi - 4,
    天同: zi - 5,
    廉贞: zi - 8,
    天府: fu,
    太阴: fu + 1,
    贪狼: fu + 2,
    巨门: fu + 3,
    天相: fu + 4,
    天梁: fu + 5,
    七杀: fu + 6,
    破军: fu + 10,
  })

  const luCun = LU_CUN[ys]!
  const wenChang = 10 - hour
  const wenQu = 4 + hour
  const zuoFu = 4 + (month - 1)
  const youBi = 10 - (month - 1)
  const minor = normalize({
    左辅: zuoFu,
    右弼: youBi,
    文昌: wenChang,
    文曲: wenQu,
    天魁: TIAN_KUI[ys]!,
    天钺: TIAN_YUE[ys]!,
    禄存: luCun,
    天马: TIAN_MA[yb % 4]!,
    火星: FIRE_START[yb % 4]! + hour,
    铃星: BELL_START[yb % 4]! + hour,
    擎羊: luCun + 1,
    陀罗: luCun - 1,
    地空: 11 - hour,
    地劫: 11 + hour,
  })

  // 截空、旬空各占两宫：阳年生人阳宫为正空，阴年生人阴宫为正空
  const jieKong = JIE_KONG_START[ys % 5]!
  const xunHead = mod(yb - ys, 12)
  const adjective = normalize({
    天官: TIAN_GUAN[ys]!,
    天福: TIAN_FU[ys]!,
    天厨: TIAN_CHU[ys]!,
    天刑: 9 + (month - 1),
    天姚: 1 + (month - 1),
    解神: JIE_SHEN[month - 1]!,
    天巫: TIAN_WU[(month - 1) % 4]!,
    天月: TIAN_YUE_MONTH[month - 1]!,
    阴煞: 2 - 2 * (month - 1),
    台辅: wenQu + 2,
    封诰: wenQu - 2,
    天空: yb + 1,
    天哭: 6 - yb,
    天虚: 6 + yb,
    龙池: 4 + yb,
    凤阁: 10 - yb,
    红鸾: 3 - yb,
    天喜: 9 - yb,
    孤辰: GU_CHEN[yb]!,
    寡宿: GUA_SU[yb]!,
    蜚廉: FEI_LIAN[yb]!,
    破碎: PO_SUI[yb % 3]!,
    华盖: HUA_GAI[yb % 4]!,
    咸池: XIAN_CHI[yb % 4]!,
    劫煞: JIE_SHA[yb % 4]!,
    // 大耗在年支对宫，阳支顺一位、阴支逆一位
    大耗: yb + 6 + (yb % 2 === 0 ? 1 : -1),
    天德: 9 + yb,
    月德: 5 + yb,
    年解: 10 - yb,
    天才: lifePalace + yb,
    天寿: bodyPalace + yb,
    三台: zuoFu + (day - 1),
    八座: youBi - (day - 1),
    恩光: wenChang + (day - 1) - 1,
    天贵: wenQu + (day - 1) - 1,
    截空: yang ? jieKong : jieKong + 1,
    截空傍: yang ? jieKong + 1 : jieKong,
    旬空: yang ? xunHead + 10 : xunHead + 11,
    旬空傍: yang ? xunHead + 11 : xunHead + 10,
    // 中州派：阳男阴女天伤在交友宫、天使在疾厄宫，阴男阳女互换
    天伤: forward ? lifePalace - 7 : lifePalace - 5,
    天使: forward ? lifePalace - 5 : lifePalace - 7,
  })

  return { major, minor, adjective }
}
