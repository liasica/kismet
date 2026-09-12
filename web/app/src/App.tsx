import { Component, type ErrorInfo, type ReactNode } from "react"
import { cn } from "cn"
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router"

import { BaziSessionProvider } from "@/components/bazi-session"
import { buttonVariants } from "@/components/ui/button"
import { ZiweiSessionProvider } from "@/components/ziwei-session"
import { useReports } from "@/lib/reports"
import { AdminPage } from "@/pages/admin"
import { AdminReportPage } from "@/pages/admin-report"
import { BaziPage } from "@/pages/bazi"
import { BaziReportPage } from "@/pages/bazi-report"
import { HomePage } from "@/pages/home"
import { SavedPage } from "@/pages/saved"
import { SharedPage } from "@/pages/shared"
import { ZiweiPage } from "@/pages/ziwei"
import { ZiweiReportPage } from "@/pages/ziwei-report"

interface ErrorBoundaryState {
  error?: Error
}

/** 单个组件抛错时显示一条错误信息，不让整个应用白屏；路由切换即重新挂载 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-start gap-4 border border-dashed border-destructive/50 p-8">
        <p className="text-sm text-destructive">页面出现错误，无法继续显示</p>
        <Link to="/" className={buttonVariants({ size: "sm" })}>
          返回首页
        </Link>
      </div>
    )
  }
}

/** 所有页面共用这一个容器的宽度，页面内不再各自设最大宽度；后台全宽 */
export function App() {
  const collected = useReports().length
  const location = useLocation()
  const wide = location.pathname.startsWith("/admin")

  return (
    <div
      className={cn(
        "mx-auto flex min-h-svh w-full flex-col gap-12 px-6 py-10",
        !wide && "max-w-4xl"
      )}
    >
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
        <ZiweiSessionProvider>
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/bazi" element={<BaziPage />} />
              <Route path="/bazi/report" element={<BaziReportPage />} />
              <Route path="/bazi/report/:id" element={<BaziReportPage />} />
              <Route path="/ziwei" element={<ZiweiPage />} />
              <Route path="/ziwei/report" element={<ZiweiReportPage />} />
              <Route path="/ziwei/report/:id" element={<ZiweiReportPage />} />
              <Route path="/saved" element={<SavedPage />} />
              <Route path="/s/:hash" element={<SharedPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/reports/:id" element={<AdminReportPage />} />
              <Route
                path="/admin/usage"
                element={<Navigate to="/admin" replace />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </ZiweiSessionProvider>
      </BaziSessionProvider>
    </div>
  )
}

export default App
