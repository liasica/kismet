import { SolarTime } from "tyme4ts"

/** 补零 */
function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0")
}

/** 把 `SolarTime` 格式化成 `YYYY-MM-DD HH:mm:ss` */
export function formatTime(t: SolarTime): string {
  return (
    `${pad(t.getYear(), 4)}-${pad(t.getMonth())}-${pad(t.getDay())}` +
    ` ${pad(t.getHour())}:${pad(t.getMinute())}:${pad(t.getSecond())}`
  )
}

/** 把 `SolarTime` 格式化成 `YYYY-MM-DD HH:mm` */
export function formatMinute(t: SolarTime): string {
  return (
    `${pad(t.getYear(), 4)}-${pad(t.getMonth())}-${pad(t.getDay())}` +
    ` ${pad(t.getHour())}:${pad(t.getMinute())}`
  )
}

/** 按分钟平移一个时刻，可跨日 */
export function shiftMinutes(t: SolarTime, minutes: number): SolarTime {
  return t.next(Math.round(minutes * 60))
}

/** 按秒平移一个时刻 */
export function shiftSeconds(t: SolarTime, seconds: number): SolarTime {
  return t.next(Math.round(seconds))
}
