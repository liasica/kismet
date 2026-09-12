import * as React from "react"
import { cn } from "cn"
import { zhCN } from "date-fns/locale"
import { RiCalendarLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { FieldDescription } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { hourBranchOf } from "@kismet/core"
import { parseClock, parseDay } from "@/lib/birth-info"

/** 可选年份范围，与排盘引擎覆盖的常用区间一致 */
const MIN_YEAR = 1900
const MAX_YEAR = 2100

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0")
}

/** 某年某月的天数 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

type Key = "year" | "month" | "day" | "hour" | "minute"

const ORDER: readonly Key[] = ["year", "month", "day", "hour", "minute"]

const SEGMENTS: Record<
  Key,
  { len: number; min: number; max: number; unit: string }
> = {
  year: { len: 4, min: MIN_YEAR, max: MAX_YEAR, unit: "年" },
  month: { len: 2, min: 1, max: 12, unit: "月" },
  day: { len: 2, min: 1, max: 31, unit: "日" },
  hour: { len: 2, min: 0, max: 23, unit: "时" },
  minute: { len: 2, min: 0, max: 59, unit: "分" },
}

type Parts = Record<Key, string>

/** 由已选的日期与时刻拆出各段的值 */
function toParts(date: string, time: string): Parts {
  const day = parseDay(date)
  const clock = parseClock(time)
  return {
    year: day ? String(day.year) : "",
    month: day ? pad(day.month) : "",
    day: day ? pad(day.day) : "",
    hour: clock ? pad(clock.hour) : "",
    minute: clock ? pad(clock.minute) : "",
  }
}

/** 日这一段的上限，年月已填全时按当月天数 */
function maxDayOf(parts: Parts): number {
  const year = Number(parts.year)
  const month = Number(parts.month)
  if (parts.year.length !== 4 || year < MIN_YEAR || year > MAX_YEAR) return 31
  if (parts.month.length !== 2 || month < 1 || month > 12) return 31
  return daysInMonth(year, month)
}

/** 某一段当前能取到的最大值 */
function maxOf(seg: Key, parts: Parts): number {
  return seg === "day" ? maxDayOf(parts) : SEGMENTS[seg].max
}

interface Parsed {
  /** `YYYY-MM-DD`，未填全或不合法为空串 */
  date: string
  /** `HH:mm`，未填全为空串 */
  time: string
  /** 已填满的段有误时的提示 */
  error?: string
  /** 出错的是哪一段 */
  at?: Key
}

/** 逐段校验，只有填满的段才判对错；日期出错不牵连时刻 */
function validate(parts: Parts): Parsed {
  const filled = (seg: Key) => parts[seg].length === SEGMENTS[seg].len
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  // 时分两段输入时已经钳在范围内，填满即可用
  const time =
    filled("hour") && filled("minute") ? `${parts.hour}:${parts.minute}` : ""

  if (filled("year") && year < MIN_YEAR) {
    return {
      date: "",
      time,
      at: "year",
      error: `年份限 ${MIN_YEAR} 到 ${MAX_YEAR}`,
    }
  }
  if (filled("month") && month < 1) {
    return { date: "", time, at: "month", error: "月份限 01 到 12" }
  }
  if (filled("day") && (day < 1 || day > maxDayOf(parts))) {
    return {
      date: "",
      time,
      at: "day",
      error: `日期限 01 到 ${pad(maxDayOf(parts))}`,
    }
  }

  const dated = filled("year") && filled("month") && filled("day")
  return {
    date: dated ? `${parts.year}-${parts.month}-${parts.day}` : "",
    time,
  }
}

/** 时或分的一列，不显示滚动条，打开时把选中项滚到中间 */
function TimeColumn({
  label,
  items,
  value,
  onPick,
}: {
  label: string
  items: readonly number[]
  value: number | undefined
  onPick: (n: number) => void
}) {
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const list = listRef.current
    const selected = list?.querySelector<HTMLElement>("[data-selected=true]")
    if (!list || !selected) return
    list.scrollTop =
      selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2
  }, [])

  return (
    <div className="flex min-h-0 w-14 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-center text-xs text-muted-foreground">
        {label}
      </div>
      <div
        ref={listRef}
        className="time-list relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="flex flex-col gap-px px-1.5 py-3">
          {items.map((n) => {
            const on = n === value
            return (
              <button
                key={n}
                type="button"
                data-selected={on}
                onClick={() => onPick(n)}
                className={cn(
                  "h-8 w-full shrink-0 text-sm tabular-nums transition-colors hover:bg-muted",
                  on && "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {pad(n)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface DateTimePickerProps {
  id?: string
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:mm` */
  time: string
  onChange: (value: { date: string; time: string }) => void
  /** 填写无误时显示在下方的说明 */
  hint?: React.ReactNode
}

/**
 * 出生时间：年月日时分五段各一格，点中哪段就整段选中，打数字直接覆盖
 *
 * 超出范围的数字按不进去，填满或再添一位必定超限就跳下一段，上下键增减、左右键换段
 */
export function DateTimePicker({
  id,
  date,
  time,
  onChange,
  hint,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [parts, setParts] = React.useState<Parts>(() => toParts(date, time))
  const refs = React.useRef<Partial<Record<Key, HTMLInputElement | null>>>({})
  const { error, at: invalid } = validate(parts)
  // 日期与时刻分开解析，只填了一半时另一半仍照常回显
  const day = parseDay(date)
  const clock = parseClock(time)
  const selected = day ? new Date(day.year, day.month - 1, day.day) : undefined
  const [month, setMonth] = React.useState<Date>(() => selected ?? new Date())

  const labels = [
    day && `${day.year} 年 ${day.month} 月 ${day.day} 日`,
    clock && `${pad(clock.hour)}:${pad(clock.minute)}`,
  ].filter(Boolean)
  const label = labels.length > 0 ? labels.join(" ") : "未填出生时间"
  const shichen = clock ? `${hourBranchOf(clock.hour)}时` : undefined

  const commit = (next: Parts) => {
    setParts(next)
    const parsed = validate(next)
    onChange({ date: parsed.date, time: parsed.time })
  }

  // 弹层选取只覆盖对应的几段，另一半留着
  const pickDate = (d: Date | undefined) => {
    if (!d) return
    commit({
      ...parts,
      year: String(d.getFullYear()),
      month: pad(d.getMonth() + 1),
      day: pad(d.getDate()),
    })
  }
  const pickTime = (hour: number, minute: number) =>
    commit({ ...parts, hour: pad(hour), minute: pad(minute) })

  /** 选中整段，光标落不到某一位上 */
  const focusSegment = (seg: Key | undefined) => {
    const el = seg && refs.current[seg]
    if (!el) return
    el.focus()
    el.select()
  }
  const sibling = (seg: Key, step: 1 | -1) => ORDER[ORDER.indexOf(seg) + step]

  const typeSegment = (seg: Key, el: HTMLInputElement) => {
    const { len } = SEGMENTS[seg]
    const digits = el.value.replace(/\D/g, "").slice(0, len)
    const max = maxOf(seg, parts)
    // 超出上限的数字不收，月份就打不出 53
    const rejected = digits !== "" && Number(digits) > max
    // 填满，或再添一位必定超限，就补零跳到下一段
    const done =
      !rejected &&
      (digits.length === len || (digits !== "" && Number(digits) * 10 > max))
    const value = rejected
      ? parts[seg]
      : done
        ? digits.padStart(len, "0")
        : digits

    // 取值没变时 React 不重渲染，得自己把格子里多出来的字符抹掉
    if (value === parts[seg]) el.value = value
    else commit({ ...parts, [seg]: value })
    if (done) focusSegment(sibling(seg, 1))
  }

  /** 上下键增减这一段，到头绕回另一端 */
  const stepSegment = (seg: Key, delta: 1 | -1) => {
    const { len, min } = SEGMENTS[seg]
    const max = maxOf(seg, parts)
    const from =
      parts[seg] === "" ? (delta > 0 ? min - 1 : max + 1) : Number(parts[seg])
    const next = from + delta
    commit({
      ...parts,
      [seg]: pad(next > max ? min : next < min ? max : next, len),
    })
  }

  const keyDown = (seg: Key, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault()
      stepSegment(seg, e.key === "ArrowUp" ? 1 : -1)
      return
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      focusSegment(sibling(seg, e.key === "ArrowRight" ? 1 : -1))
      return
    }
    if (e.key === "Backspace") {
      e.preventDefault()
      if (parts[seg] !== "") {
        commit({ ...parts, [seg]: "" })
        return
      }
      const prev = sibling(seg, -1)
      if (!prev) return
      commit({ ...parts, [prev]: "" })
      focusSegment(prev)
    }
  }

  // 粘贴整串时刻，按段切开填入，非法的留给校验提示
  const paste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "")
    if (digits === "") return
    e.preventDefault()
    const next = { ...parts }
    let at = 0
    let last: Key = "year"
    for (const seg of ORDER) {
      const chunk = digits.slice(at, at + SEGMENTS[seg].len)
      if (chunk.length < SEGMENTS[seg].len) break
      next[seg] = chunk
      at += SEGMENTS[seg].len
      last = seg
    }
    commit(next)
    focusSegment(last)
  }

  // 焦点离开整行时，把月日时分只填了一位的段补零，如「5 月」记成「05」
  const groupBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    const next = { ...parts }
    let changed = false
    for (const seg of ORDER) {
      const { len } = SEGMENTS[seg]
      if (len !== 2 || next[seg].length !== 1) continue
      next[seg] = next[seg].padStart(2, "0")
      changed = true
    }
    if (changed) commit(next)
  }

  const segment = (seg: Key) => (
    <React.Fragment key={seg}>
      <input
        id={seg === "year" ? id : undefined}
        ref={(el) => {
          refs.current[seg] = el
        }}
        value={parts[seg]}
        inputMode="numeric"
        autoComplete="off"
        aria-label={SEGMENTS[seg].unit}
        aria-invalid={invalid === seg}
        className={cn(
          "h-9 min-w-0 border border-input bg-transparent text-center text-sm tabular-nums transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 aria-invalid:border-destructive",
          seg === "year" ? "w-13" : "w-10"
        )}
        onChange={(e) => typeSegment(seg, e.currentTarget)}
        onKeyDown={(e) => keyDown(seg, e)}
        onFocus={(e) => e.currentTarget.select()}
        onMouseDown={(e) => {
          // 点哪都选中整段，光标不落到某一位上
          if (document.activeElement === e.currentTarget) return
          e.preventDefault()
          focusSegment(seg)
        }}
      />
      <span className="shrink-0 text-sm text-muted-foreground">
        {SEGMENTS[seg].unit}
      </span>
    </React.Fragment>
  )

  return (
    <div className="flex flex-col gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          // 每次打开都回到所选日期所在的月份
          if (next && selected) setMonth(selected)
          setOpen(next)
        }}
      >
        <div
          className="flex items-center gap-1.5"
          onBlur={groupBlur}
          onPaste={paste}
        >
          {segment("year")}
          {segment("month")}
          {segment("day")}
          <span className="w-2 shrink-0" />
          {segment("hour")}
          {segment("minute")}
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto shrink-0"
                aria-label="打开日历"
              />
            }
          >
            <RiCalendarLine />
          </PopoverTrigger>
        </div>

        <PopoverContent
          align="end"
          className="w-auto max-w-[calc(100vw-2rem)] gap-0 p-0"
        >
          <div className="relative flex flex-col sm:flex-row">
            <Calendar
              mode="single"
              locale={zhCN}
              captionLayout="dropdown"
              startMonth={new Date(MIN_YEAR, 0)}
              endMonth={new Date(MAX_YEAR, 11)}
              month={month}
              onMonthChange={setMonth}
              selected={selected}
              onSelect={pickDate}
              className="sm:mr-28"
            />
            {/* 时分两列绝对定位，高度跟随日历而不被自身列表撑高 */}
            <div className="flex h-44 border-t border-border sm:absolute sm:inset-y-0 sm:right-0 sm:h-auto sm:border-t-0 sm:border-l">
              <TimeColumn
                label="时"
                items={HOURS}
                value={clock?.hour}
                onPick={(h) => pickTime(h, clock?.minute ?? 0)}
              />
              <TimeColumn
                label="分"
                items={MINUTES}
                value={clock?.minute}
                onPick={(m) => pickTime(clock?.hour ?? 0, m)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {label}
              {shichen && <span className="font-serif"> {shichen}</span>}
            </span>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              确定
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <FieldDescription className="m-0">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : (
          <>
            {shichen && (
              <span className="font-serif text-foreground">{shichen} · </span>
            )}
            {hint}
          </>
        )}
      </FieldDescription>
    </div>
  )
}
