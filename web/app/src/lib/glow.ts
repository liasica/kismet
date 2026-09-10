import type * as React from "react"

/**
 * 光斑跟随指针：把指针在元素内的位置与相对中心的偏移写进 CSS 变量
 *
 * 配套样式见 index.css 的 `.module-card`，光斑照亮边框与底纹，底纹随偏移轻微位移
 */
export function trackGlow(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  el.style.setProperty("--x", `${x}px`)
  el.style.setProperty("--y", `${y}px`)
  el.style.setProperty("--dx", String((x / rect.width - 0.5) * 2))
  el.style.setProperty("--dy", String((y / rect.height - 0.5) * 2))
}
