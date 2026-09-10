/**
 * 八字排盘的输入、选项与结果数据结构
 *
 * 干支、节气、农历换算全部委托 `tyme4ts`（寿星天文历，分钟级精度）
 * 本项目自实现的部分：真太阳时校正、夏令时、早晚子时分支、神煞表、五行强弱评分
 */

export type Gender = "male" | "female"

export type PillarKind = "year" | "month" | "day" | "hour"

/** 五行，用于展示的字面值 */
export type FiveElement = "木" | "火" | "土" | "金" | "水"

/**
 * 五行在序列化结构里的键
 *
 * JSON 的 key 一律用英文，Go 与移动端解析中文 key 很别扭；中文只出现在值与界面上
 */
export type ElementKey = "wood" | "fire" | "earth" | "metal" | "water"

/** 地支藏干的三个层次：本气、中气、余气 */
export type HideStemType = "main" | "middle" | "residual"

/** 起运折算精度 */
export type QiYunPrecision = "day" | "hour"

/** 排盘输入，时刻一律视为北京时间（UTC+8）的钟表读数 */
export interface PaipanInput {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  gender: Gender
  /** 姓名，仅用于结果展示 */
  name?: string
  /** 出生地经度，东经为正，用于真太阳时 */
  longitude?: number
  /** 出生地纬度，北纬为正，本版排盘不参与计算，随结果回显 */
  latitude?: number
  /** 出生地显示名，如「浙江省 杭州市 西湖区」 */
  location?: string
}

/**
 * 流派选项
 *
 * 命理各家在时间口径与起运折算上分歧较大，这里的默认值取自本项目的规则文档，
 * 每一项都是可切换的流派选择而非唯一正解，含义与差异见 `README`
 */
export interface PaipanOptions {
  /** 真太阳时校正，为 `true` 时必须提供 `longitude` */
  useTrueSolarTime: boolean
  /**
   * 输入时刻按夏令时钟表读数处理，落在中国 1986 至 1991 年夏令时区间内的时刻回拨一小时
   *
   * 只影响这六年，其他年份此开关无作用
   */
  useDaylightSaving: boolean
  /** 晚子时（23:00 至 24:00）是否算次日日柱，`false` 时算当天并按当天日干重推时干 */
  lateZiAsNextDay: boolean
  /** 起运折算精度，`day` 折到日，`hour` 继续折到时辰 */
  qiYunPrecision: QiYunPrecision
  /**
   * 神煞的基准柱自身不再标注该神煞
   *
   * 问真八字用这个口径，例如将星以年支查、年支自身是将星时它不在年柱标注
   */
  shenShaSkipBasePillar: boolean
  /** 流年输出到多少岁 */
  maxAge: number
  /** 五行强弱评分策略名 */
  elementStrategy: string
}

/** 地支藏干的一位 */
export interface HideStem {
  stem: string
  type: HideStemType
  /** 该藏干对日主的十神 */
  tenStar: string
  element: FiveElement
}

/** 一柱 */
export interface Pillar {
  kind: PillarKind
  /** 干支，如 `庚午` */
  sixtyCycle: string
  stem: string
  branch: string
  stemElement: FiveElement
  branchElement: FiveElement
  /** 天干对日主的十神，日柱为 `日主` */
  stemTenStar: string
  hideStems: HideStem[]
  /** 纳音 */
  sound: string
  /** 日干在本柱地支的十二长生，问真称「星运」 */
  terrain: string
  /** 本柱天干在本柱地支的十二长生，问真称「自坐」 */
  selfTerrain: string
  /** 本柱所在旬，如 `甲子` */
  ten: string
  /** 本柱自身的旬空地支 */
  extraBranches: string[]
  /** 本柱地支是否落在日柱旬空内 */
  empty: boolean
}

/** 节气交节点 */
export interface TermPoint {
  name: string
  /** `YYYY-MM-DD HH:mm:ss` */
  time: string
}

/** 时间校正的全过程 */
export interface TimeInfo {
  /** 输入原始时刻 */
  input: string
  /** 夏令时回拨后的标准北京时间 */
  standard: string
  /** 实际用于排盘的时刻 */
  effective: string
  /** 夏令时回拨的分钟数，未命中区间为 0 */
  daylightSavingMinutes: number
  /** 经度差偏移分钟数，`(longitude - 120) * 4` */
  longitudeMinutes: number
  /** 均时差分钟数 */
  equationOfTimeMinutes: number
  /** 地方平太阳时，未开启真太阳时则与 `standard` 相同 */
  meanSolar: string
  /** 农历日期 */
  lunar: string
  /** 生肖 */
  zodiac: string
  /** 所处节气 */
  term: TermPoint
  /** 上一个节 */
  prevJie: TermPoint
  /** 下一个节 */
  nextJie: TermPoint
}

/** 单个五行的得分明细 */
export interface ElementContribution {
  source: string
  element: FiveElement
  weight: number
  reason: string
}

/** 五行强弱结果 */
export interface ElementReport {
  strategy: string
  scores: Record<ElementKey, number>
  total: number
  /** 日主同类得分，比劫加印星 */
  supportScore: number
  /** 日主异类得分，食伤加财星加官杀 */
  opposeScore: number
  /** 日主旺衰倾向 */
  strength: "旺" | "偏旺" | "中和" | "偏弱" | "弱"
  /** 月令主导的旺相休囚死 */
  seasonalState: Record<ElementKey, string>
  contributions: ElementContribution[]
}

/** 一条命中的神煞 */
export interface ShenShaHit {
  name: string
  pillar: PillarKind
  /** 命中的干支字 */
  matched: string
  /** 查法基准与基准值，如 `年支午` */
  by: string
  note: string
}

/** 起运 */
export interface QiYun {
  /** 顺排为 `true` */
  forward: boolean
  yearCount: number
  monthCount: number
  dayCount: number
  hourCount: number
  minuteCount: number
  /** 起运时刻 */
  startTime: string
  /** 起运虚岁 */
  startAge: number
  /** 折算所依据的那个节 */
  term: TermPoint
  precision: QiYunPrecision
  /** 「出生后 0 年 10 月 12 天 4 时起运」 */
  text: string
}

/** 流年 */
export interface FortuneYear {
  year: number
  /** 虚岁 */
  age: number
  sixtyCycle: string
  stemTenStar: string
  /** 地支本气藏干对日主的十神 */
  branchTenStar: string
  /** 小运干支 */
  minorFortune: string
}

/** 大运一步 */
export interface DecadeFortuneStep {
  index: number
  sixtyCycle: string
  stemTenStar: string
  branchTenStar: string
  startAge: number
  endAge: number
  startYear: number
  endYear: number
  years: FortuneYear[]
}

/** 流月，以节为界 */
export interface FortuneMonth {
  /** 节名 */
  termName: string
  /** 交节时刻 */
  termTime: string
  sixtyCycle: string
  stemTenStar: string
  branchTenStar: string
}

/** 排盘结果 */
export interface Chart {
  name?: string
  gender: Gender
  input: PaipanInput
  options: PaipanOptions
  location?: {
    name?: string
    longitude?: number
    latitude?: number
  }
  time: TimeInfo
  pillars: Record<PillarKind, Pillar>
  /** 日主天干 */
  dayStem: string
  dayStemElement: FiveElement
  /** 以日柱旬取的空亡地支 */
  emptyBranches: string[]
  elements: ElementReport
  shenSha: ShenShaHit[]
  qiYun: QiYun
  decades: DecadeFortuneStep[]
  /** 出生当年的流月 */
  months: FortuneMonth[]
  /** 胎元、胎息、命宫、身宫 */
  extras: {
    fetalOrigin: string
    fetalBreath: string
    ownSign: string
    bodySign: string
  }
}
