import * as React from "react"
import { cn } from "cn"

/** 横向滚动的一行：不显示滚动条，哪一侧还有内容就在哪一侧渐隐 */
export function ScrollRow({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fade, setFade] = React.useState({ start: false, end: false })

  const update = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
    setFade((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    )
  }, [])

  // 子项数量变化不会触发 ResizeObserver，每次渲染后都重算一次
  React.useEffect(update)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [update])

  return (
    <div
      ref={ref}
      data-fade-start={fade.start || undefined}
      data-fade-end={fade.end || undefined}
      className={cn("scroll-row flex gap-2 overflow-x-auto", className)}
      onScroll={update}
    >
      {children}
    </div>
  )
}
