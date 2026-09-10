import * as React from "react"
import { cn } from "cn"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { RiCalendarLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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

function pad(n: number): string {
  return String(n).padStart(2, "0")
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
    <div className="flex w-14 min-h-0 flex-col">
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
}

/**
 * 出生时间选择：左侧日历按年月下拉定位，右侧时、分两列滚动选取
 *
 * 选定项即时回写，弹层底部回显所选时刻与对应的时辰
 */
export function DateTimePicker({
  id,
  date,
  time,
  onChange,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  // 日期与时刻分开解析，只选了一半时另一半仍照常回显
  const day = parseDay(date)
  const clock = parseClock(time)
  const selected = day ? new Date(day.year, day.month - 1, day.day) : undefined
  const [month, setMonth] = React.useState<Date>(() => selected ?? new Date())

  const parts = [
    day && `${day.year} 年 ${day.month} 月 ${day.day} 日`,
    clock && `${pad(clock.hour)}:${pad(clock.minute)}`,
  ].filter(Boolean)
  const label = parts.length > 0 ? parts.join(" ") : "选择出生时间"
  const shichen = clock ? `${hourBranchOf(clock.hour)}时` : undefined

  const pickDate = (d: Date | undefined) => {
    if (!d) return
    onChange({ date: format(d, "yyyy-MM-dd"), time })
  }
  const pickTime = (hour: number, minute: number) =>
    onChange({ date, time: `${pad(hour)}:${pad(minute)}` })

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // 每次打开都回到所选日期所在的月份
        if (next && selected) setMonth(selected)
        setOpen(next)
      }}
    >
      <PopoverTrigger
        id={id}
        render={
          <Button
            variant="outline"
            className="w-full justify-between font-normal"
            aria-label="选择出生时间"
          />
        }
      >
        <span className="flex items-baseline gap-2 truncate">
          <span className={cn(parts.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          {shichen && (
            <span className="font-serif text-muted-foreground">{shichen}</span>
          )}
        </span>
        <RiCalendarLine className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
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
          <Button size="xs" variant="secondary" onClick={() => setOpen(false)}>
            确定
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
