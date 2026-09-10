/** 行政层级，`town` 含街道、镇、乡 */
export type RegionLevel = "province" | "city" | "county" | "town"

export interface Region {
  /** 统计用区划代码，省市区县 6 位，乡镇 9 位 */
  code: string
  /** 全名，例如 `广东省`、`东莞市`、`樟木头镇` */
  name: string
  level: RegionLevel
  /** 经度，东经为正，4 位小数 */
  lng: number
  /** 纬度，北纬为正，4 位小数 */
  lat: number
}

/** 乡镇分片的存储结构，字段含义见 `data/region/divisions.json` */
export interface TownShard {
  codes: number[]
  names: string
  lng: number[]
  lat: number[]
}

/** 乡镇的跨级搜索索引，只有名称与代码，不含经纬度 */
export interface TownIndex {
  codes: number[]
  names: string
}

/** 一条搜索命中 */
export interface RegionMatch {
  code: string
  name: string
  level: RegionLevel
  /** 从省级到自身的完整地名，如 `广东省 东莞市 樟木头镇` */
  fullName: string
  /**
   * 从省级到自身的代码路径，末项即自身
   *
   * 联动面板拿它把三栏定位到命中项所在的位置
   */
  path: string[]
}
