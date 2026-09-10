import { cn } from "cn"
import { Link, Navigate, NavLink, Route, Routes } from "react-router"

import { BaziSessionProvider } from "@/components/bazi-session"
import { useReports } from "@/lib/reports"
import { BaziPage } from "@/pages/bazi"
import { BaziReportPage } from "@/pages/bazi-report"
import { HomePage } from "@/pages/home"
import { SavedPage } from "@/pages/saved"

/** 所有页面共用这一个容器的宽度，页面内不再各自设最大宽度 */
export function App() {
  const collected = useReports().length

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-12 px-6 py-10">
      <header className="flex items-baseline justify-between gap-6">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="font-heading text-2xl">遇见</span>
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            Kismet
          </span>
        </Link>
        <nav className="flex items-baseline gap-6">
          <NavLink
            to="/saved"
            className={({ isActive }) =>
              cn(
                "flex items-baseline gap-1.5 text-sm transition-colors hover:text-foreground",
                isActive ? "text-foreground" : "text-muted-foreground"
              )
            }
          >
            收藏
            {collected > 0 && (
              <span className="text-xs tabular-nums">{collected}</span>
            )}
          </NavLink>
          <span className="text-xs text-muted-foreground">按 D 切换明暗</span>
        </nav>
      </header>

      <BaziSessionProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/bazi" element={<BaziPage />} />
          <Route path="/bazi/report" element={<BaziReportPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BaziSessionProvider>
    </div>
  )
}

export default App
