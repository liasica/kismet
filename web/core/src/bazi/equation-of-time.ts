/**
 * 均时差
 *
 * 算法出处：Jean Meeus, `Astronomical Algorithms` 2nd ed.
 * - 均时差主式取第 28 章式 (28.1)：`E = L0 - 0.0057183 - α + Δψ·cos ε`
 * - 太阳几何平黄经 L0 用式 (25.2)，平近点角 M 用式 (25.3)，中心差 C 用第 25 章
 * - 视黄经用式 (25.9)，含光行差常数项与黄经章动主项
 * - 平黄赤交角 ε0 用式 (22.2)，真交角加上交角章动主项 `0.00256·cos Ω`
 *
 * 这套公式是**自包含**的，不依赖任何天文级数表。这一点是刻意的：Go 服务端要
 * 排出与 Web 端逐位相同的盘，而 `tyme4go` 没有导出寿星天文历的太阳黄经函数，
 * 两边只有共用同一套自包含公式才能保证一致。
 *
 * 精度：对 Meeus 书中例 28.1（1992-10-13.0）算得 +13m42.0s，印刷值 +13m42.6s；
 * 与寿星天文历级数（`tyme4ts` 的 `ShouXingUtil`）逐日比对 1887、1893、1904、
 * 1950、1990、2024 六年，最大相差 2.02 秒。真太阳时只取到分钟，秒级差异只在
 * 秒位恰好落在取整边界时才影响结果。
 *
 * 力学时与世界时之差 ΔT 未参与计算：均时差每天变化约 20 秒，1990 年的 ΔT 约
 * 57 秒，折合影响 0.013 秒，远小于本算法自身的误差
 */

/** J2000.0 历元的儒略日 */
const J2000 = 2451545

/** 一个儒略世纪的天数 */
const DAYS_PER_CENTURY = 36525

const RAD_PER_DEG = Math.PI / 180
const DEG_PER_RAD = 180 / Math.PI

/** 北京时间的标准经线 */
const BEIJING_MERIDIAN = 120

/** 地球自转 1 度对应的时间分钟数 */
const MINUTES_PER_DEGREE = 4

/** 北京时间相对世界时的小时数 */
const BEIJING_UTC_OFFSET_HOURS = 8

/**
 * 公历日期转儒略日，时刻按世界时解释
 *
 * Meeus, `Astronomical Algorithms` 2nd ed., 第 7 章
 */
function julianDay(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    (hour + minute / 60) / 24 +
    b -
    1524.5
  )
}

/** 角度归一化到 [0, 360) */
function normalizeDegrees(degrees: number): number {
  const r = degrees % 360
  return r < 0 ? r + 360 : r
}

/** 角度归一化到 [-180, 180) */
function wrapDegrees(degrees: number): number {
  return normalizeDegrees(degrees + 180) - 180
}

/** 由儒略日（世界时）算均时差，单位分钟 */
function equationOfTimeAt(jd: number): number {
  const t = (jd - J2000) / DAYS_PER_CENTURY

  // 太阳几何平黄经与平近点角，度
  const meanLongitude = 280.46646 + t * (36000.76983 + t * 0.0003032)
  const meanAnomaly = (357.52911 + t * (35999.05029 - t * 0.0001537)) * RAD_PER_DEG

  // 中心差
  const center =
    (1.914602 - t * (0.004817 + t * 0.000014)) * Math.sin(meanAnomaly) +
    (0.019993 - t * 0.000101) * Math.sin(2 * meanAnomaly) +
    0.000289 * Math.sin(3 * meanAnomaly)

  // 月球升交点平黄经，章动两个主项都由它给出
  const ascendingNode = (125.04 - 1934.136 * t) * RAD_PER_DEG
  const nutationInLongitude = -0.00478 * Math.sin(ascendingNode)

  // 视黄经，0.00569 度是光行差常数项
  const apparentLongitude =
    (meanLongitude + center - 0.00569 + nutationInLongitude) * RAD_PER_DEG

  // 平黄赤交角加交角章动主项
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliquity =
    (meanObliquity + 0.00256 * Math.cos(ascendingNode)) * RAD_PER_DEG

  // 视赤经，度。忽略太阳黄纬，其最大值 1.2 角秒折合时间不足 0.03 秒
  const rightAscension =
    Math.atan2(
      Math.cos(obliquity) * Math.sin(apparentLongitude),
      Math.cos(apparentLongitude)
    ) * DEG_PER_RAD

  const delta =
    normalizeDegrees(meanLongitude) -
    0.0057183 -
    normalizeDegrees(rightAscension) +
    nutationInLongitude * Math.cos(obliquity)

  return wrapDegrees(delta) * MINUTES_PER_DEGREE
}

/**
 * 均时差：真太阳时与地方平太阳时之差，单位分钟，范围约 -14 ~ +17
 *
 * 正值表示真太阳时快于平太阳时。时刻按世界时解释，省略时按当日 12:00 取值
 */
export function equationOfTime(
  year: number,
  month: number,
  day: number,
  hour?: number,
  minute?: number
): number {
  return equationOfTimeAt(julianDay(year, month, day, hour ?? 12, minute ?? 0))
}

/** 北京时间 -> 真太阳时的总偏移分钟数（经度差加均时差） */
export function trueSolarOffsetMinutes(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  longitude: number
): number {
  // 减 8 小时落在儒略日的小数部分上，跨日由儒略日本身连续处理
  const jd = julianDay(year, month, day, hour - BEIJING_UTC_OFFSET_HOURS, minute)
  const longitudeOffset = (longitude - BEIJING_MERIDIAN) * MINUTES_PER_DEGREE
  return longitudeOffset + equationOfTimeAt(jd)
}
