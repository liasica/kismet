/**
 * 紫微斗数排盘的选项与结果数据结构
 *
 * 口径取中州派（王亭之讲义），与坊本的差异见 web/core/README.md。
 * JSON 的 key 一律英文，中文只出现在值与界面上
 */

import type {
  FiveElement,
  Gender,
  Location,
  PaipanInput,
  TimeInfo,
} from "../birth/types"

export interface ZiweiOptions {
  /** 真太阳时校正，为 `true` 时必须提供 `longitude` */
  useTrueSolarTime: boolean
  /** 输入时刻按夏令时钟表读数处理，只影响 1986 至 1991 年 */
  useDaylightSaving: boolean
  /** 晚子时（23:00 至 24:00）是否算次日，中州派以零时为一日之始，默认为 `false` */
  lateZiAsNextDay: boolean
  /** 小限与流年输出到多少虚岁 */
  maxAge: number
}

/** 庙陷六级，「地」是中州派表中原字 */
export type Brightness = "庙" | "旺" | "地" | "平" | "闲" | "陷"

export type ZiweiMutation = "禄" | "权" | "科" | "忌"

export type PalaceName =
  | "命宫"
  | "兄弟宫"
  | "夫妻宫"
  | "子女宫"
  | "财帛宫"
  | "疾厄宫"
  | "迁移宫"
  | "交友宫"
  | "事业宫"
  | "田宅宫"
  | "福德宫"
  | "父母宫"

/** 宫内的一颗星 */
export interface ZiweiStar {
  name: string
  /** 只有正曜与辅佐煞曜有庙陷 */
  brightness?: Brightness
  /** 生年四化 */
  mutation?: ZiweiMutation
}

/** 大限一步 */
export interface Decade {
  /** 自命宫起第几步，命宫为 0 */
  index: number
  startAge: number
  endAge: number
  startYear: number
  endYear: number
}

export interface ZiweiPalace {
  /** 自命宫逆布的序号，命宫 0、兄弟 1 …… 父母 11 */
  index: number
  name: PalaceName
  branch: string
  stem: string
  /** 宫干支，如 `丁亥` */
  sixtyCycle: string
  isBodyPalace: boolean
  /** 十四正曜 */
  majorStars: ZiweiStar[]
  /** 辅佐煞曜：左辅 右弼 文昌 文曲 天魁 天钺 禄存 天马 火星 铃星 擎羊 陀罗 地空 地劫 */
  minorStars: ZiweiStar[]
  /** 杂曜，截空与旬空的傍空记作「截空傍」「旬空傍」 */
  adjectiveStars: ZiweiStar[]
  /** 长生十二神 */
  changSheng: string
  /** 博士十二神 */
  boShi: string
  decade: Decade
  /** 小限落在此宫的虚岁，到 `maxAge` 为止 */
  minorLimitAges: number[]
}

/** 农历生辰 */
export interface ZiweiLunar {
  /** 农历年，以正月初一为界 */
  year: number
  yearSixtyCycle: string
  month: number
  leap: boolean
  day: number
  /** 安星所用的月份：闰月十六起按下一个月 */
  effectiveMonth: number
  hourBranch: string
  /** 农历文字，如「农历庚午年四月初九」 */
  text: string
}

/** 五行局 */
export interface Bureau {
  /** 如「土五局」 */
  name: string
  element: FiveElement
  /** 局数 2 至 6 */
  number: number
}

/** 生年四化的一条 */
export interface ZiweiStarMutation {
  star: string
  mutation: ZiweiMutation
}

export interface ZiweiChart {
  name?: string
  gender: Gender
  input: PaipanInput
  options: ZiweiOptions
  location?: Location
  time: TimeInfo
  lunar: ZiweiLunar
  yearStem: string
  yearBranch: string
  /** 阳年生为 `true` */
  yang: boolean
  /** 阳男阴女为 `true`，大限、长生、博士顺行 */
  forward: boolean
  /** 命宫地支 */
  lifePalace: string
  /** 身宫地支 */
  bodyPalace: string
  bureau: Bureau
  lifeMaster: string
  bodyMaster: string
  /** 生年四化，按禄权科忌排列 */
  mutations: ZiweiStarMutation[]
  /** 十二宫，按地支子至亥排列 */
  palaces: ZiweiPalace[]
}

/** 流曜的一颗 */
export interface FlowStar {
  name: string
  branch: string
}

/** 大限或流年的流曜 */
export interface ZiweiFlow {
  scope: "decade" | "year"
  stem: string
  branch: string
  sixtyCycle: string
  /** 大限为大限宫地支，流年为太岁宫地支 */
  lifePalace: string
  /** 流禄 流羊 流陀 流魁 流钺 流昌 流曲 流马，流年另有年解 */
  stars: FlowStar[]
  mutations: ZiweiStarMutation[]
}

/** 一个流年 */
export interface ZiweiYear extends ZiweiFlow {
  /** 农历年 */
  year: number
  /** 虚岁 */
  age: number
  /** 岁前十二神，按地支子至亥 */
  suiQian: string[]
  /** 将前十二神，按地支子至亥 */
  jiangQian: string[]
  /** 斗君所在地支，流月正月由此起 */
  douJun: string
  /** 小限所在地支 */
  minorLimit: string
}

/** 某个日期所处的运限 */
export interface ZiweiLimit {
  lunarYear: number
  age: number
  /** 起限之前为 `undefined` */
  decade?: Decade
  yearly: ZiweiYear
}
