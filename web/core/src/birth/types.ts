/**
 * 各命理体系共用的出生信息类型
 *
 * 八字与紫微斗数都吃同一份输入，时间校正的过程也只有一份
 */

export type Gender = "male" | "female"

/** 五行，用于展示的字面值 */
export type FiveElement = "木" | "火" | "土" | "金" | "水"

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

/** 时间校正用到的两个开关，各体系的选项都包含这两项 */
export interface TimeOptions {
  /** 真太阳时校正，为 `true` 时必须提供 `longitude` */
  useTrueSolarTime: boolean
  /** 输入时刻按夏令时钟表读数处理，只影响中国 1986 至 1991 年 */
  useDaylightSaving: boolean
}

/** 出生地回显 */
export interface Location {
  name?: string
  longitude?: number
  latitude?: number
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
