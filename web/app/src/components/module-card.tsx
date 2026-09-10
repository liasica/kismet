import * as React from "react"
import { cn } from "cn"
import { RiArrowRightLine } from "@remixicon/react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { trackGlow } from "@/lib/glow"

interface ModuleCardProps {
  /** 拉丁小字眉题，如 `Four Pillars` */
  eyebrow: string
  title: string
  description: string
  /** 有路径即可进入，没有则只展示 */
  to?: string
  /** 右上角状态，如「待实现」 */
  status?: string
  /** 卡片右下的底纹图形 */
  figure: React.ReactNode
}

/**
 * 首页的命理体系入口
 *
 * 光斑跟随指针照亮边框与底纹，底纹随指针轻微位移；不可进入的卡片光斑改为灰色
 */
export function ModuleCard({
  eyebrow,
  title,
  description,
  to,
  status,
  figure,
}: ModuleCardProps) {
  const className = cn(
    "module-card group relative flex min-h-72 ring-1 ring-foreground/5 transition-[transform,box-shadow] duration-300 ease-out outline-none motion-reduce:transition-none",
    to
      ? "hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:hover:translate-y-0"
      : "module-card-muted cursor-not-allowed"
  )

  const body = (
    <>
      <span className="module-card-glow" aria-hidden />
      <span className="relative m-px flex flex-1 flex-col gap-3 overflow-hidden bg-card p-8">
        <span className="module-card-light" aria-hidden />

        <span className="relative flex items-baseline justify-between gap-4">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            {eyebrow}
          </span>
          {status && <Badge variant="secondary">{status}</Badge>}
        </span>
        <span
          className={cn(
            "relative font-serif text-3xl tracking-wide",
            !to && "text-muted-foreground"
          )}
        >
          {title}
        </span>

        <span className="relative flex flex-1 flex-col justify-between gap-6 sm:flex-row">
          <span className="flex min-w-0 flex-1 flex-col justify-between gap-6">
            <span className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </span>
            {to && (
              <span className="flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase">
                进入
                <RiArrowRightLine className="size-3.5 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
              </span>
            )}
          </span>
          <span
            className="module-card-figure pointer-events-none shrink-0 self-end opacity-60 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden
          >
            {figure}
          </span>
        </span>
      </span>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className} onPointerMove={trackGlow}>
        {body}
      </Link>
    )
  }
  return (
    <div className={className} aria-disabled onPointerMove={trackGlow}>
      {body}
    </div>
  )
}
