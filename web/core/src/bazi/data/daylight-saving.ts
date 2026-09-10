/**
 * 中国夏令时区间
 *
 * 数据来源：国务院 1986 年 4 月发布的夏令时通知，以及 IANA 时区数据库 `Asia/Shanghai`
 * 的 `PRC` 规则段。适用年份仅 1986 至 1991 六年，1992 年起中国不再实行夏令时
 *
 * 区间端点写的是**钟表读数**，不是标准时：
 * - 开始日标准时 02:00 拨到 03:00，所以钟表读数从开始日 03:00 起进入夏令时
 * - 结束日钟表 02:00 拨回 01:00，所以钟表读数到结束日 02:00 为止
 *
 * 结束日 01:00 至 02:00 这一小时在钟表上出现两次，仅凭读数无法区分，
 * 本实现按夏令时处理，这是一个可配置的流派边界
 */
export interface DstRange {
  /** 起始钟表读数 `[year, month, day, hour, minute]` */
  start: readonly [number, number, number, number, number]
  /** 结束钟表读数，右开区间 */
  end: readonly [number, number, number, number, number]
}

export const CHINA_DST_RANGES: readonly DstRange[] = [
  { start: [1986, 5, 4, 3, 0], end: [1986, 9, 14, 2, 0] },
  { start: [1987, 4, 12, 3, 0], end: [1987, 9, 13, 2, 0] },
  { start: [1988, 4, 10, 3, 0], end: [1988, 9, 11, 2, 0] },
  { start: [1989, 4, 16, 3, 0], end: [1989, 9, 17, 2, 0] },
  { start: [1990, 4, 15, 3, 0], end: [1990, 9, 16, 2, 0] },
  { start: [1991, 4, 14, 3, 0], end: [1991, 9, 15, 2, 0] },
]

/** 夏令时相对标准时快的分钟数 */
export const DST_OFFSET_MINUTES = 60

/** 把 `[y, m, d, h, mi]` 压成可比较的整数 */
function key(y: number, m: number, d: number, h: number, mi: number): number {
  return (((y * 100 + m) * 100 + d) * 100 + h) * 100 + mi
}

/** 判断一个钟表读数是否落在中国夏令时区间内 */
export function isInChinaDst(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): boolean {
  const k = key(year, month, day, hour, minute)
  return CHINA_DST_RANGES.some((r) => k >= key(...r.start) && k < key(...r.end))
}
