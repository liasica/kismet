import * as React from "react"
import {
  RiForbid2Line,
  RiRefreshLine,
  RiShieldCheckLine,
} from "@remixicon/react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  setAdminPassword,
  UnauthorizedError,
  useAdminPassword,
  type AdminReportSummary,
} from "@/lib/admin"
import { errorMessage } from "@/lib/api"
import { formatSavedAt } from "@/lib/reports"
import { systemMetaOf } from "@/lib/system"
import {
  browserLabel,
  fetchReportUsage,
  formatTokens,
  resetUsage,
  setUsageRule,
  usageKindLabel,
  usageRuleLabel,
  usageValueLabel,
  type AdminUsage,
  type QuotaLimits,
  type ReportUsage,
  type UsageRule,
} from "@/lib/usage"

/**
 * 报告列表里的用量入口：抽屉列出这份报告的客户端对应的两个配额主体
 *
 * 指纹一个、来源 IP 一个，次数、tokens 与处置都在这里看与改，不必再去用量页找
 */
export function ReportUsageSheet({ report }: { report: AdminReportSummary }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="sm" />}
        onClick={(e) => e.stopPropagation()}
      >
        用量
      </SheetTrigger>
      {/* 抽屉是 Portal，点击仍沿 React 树冒到表格行上，挡住才不会跳去报告详情 */}
      <SheetContent
        className="overflow-y-auto data-[side=right]:sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SheetHeader>
          <SheetTitle>用量</SheetTitle>
          <SheetDescription>
            {report.input.name || "未具名"} ·{" "}
            {formatSavedAt(Date.parse(report.createdAt))}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-8 px-8 pb-8">
          {open && <UsageList id={report.id} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; usage: ReportUsage }
  | { kind: "failed"; message: string }

function UsageList({ id }: { id: string }) {
  const password = useAdminPassword()
  const [state, setState] = React.useState<State>({ kind: "loading" })
  const [busy, setBusy] = React.useState<string>()
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    let cancelled = false
    fetchReportUsage(password, id)
      .then((usage) => {
        if (!cancelled) setState({ kind: "ready", usage })
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof UnauthorizedError) setAdminPassword("")
        else setState({ kind: "failed", message: errorMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [password, id])

  // 改完就地换掉那一条，不重拉整份
  const apply = async (key: string, action: () => Promise<AdminUsage>) => {
    setBusy(key)
    setError(undefined)
    try {
      const updated = await action()
      setState((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              usage: {
                ...current.usage,
                items: current.usage.items.map((item) =>
                  item.key === key ? withReports(updated, item) : item
                ),
              },
            }
          : current
      )
    } catch (e) {
      if (e instanceof UnauthorizedError) setAdminPassword("")
      else setError(errorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-muted-foreground">加载中</p>
  }
  if (state.kind === "failed") {
    return <p className="text-sm text-destructive">{state.message}</p>
  }
  if (state.usage.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">这份报告没有记下客户端</p>
    )
  }

  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {state.usage.items.map((item) => (
        <UsageCard
          key={item.key}
          item={item}
          limits={state.usage.limits}
          busy={busy === item.key}
          onReset={() =>
            void apply(item.key, () => resetUsage(password, item.key))
          }
          onRule={(rule) =>
            void apply(item.key, () => setUsageRule(password, item.key, rule))
          }
        />
      ))}
    </>
  )
}

/** 回写的那一条只带用量本身，名下的报告照旧取原来那份 */
function withReports(updated: AdminUsage, previous: AdminUsage): AdminUsage {
  return {
    ...updated,
    reports: previous.reports,
    reportTotal: previous.reportTotal,
  }
}

interface UsageCardProps {
  item: AdminUsage
  limits: QuotaLimits
  busy: boolean
  onReset: () => void
  onRule: (rule: UsageRule) => void
}

function UsageCard({ item, limits, busy, onReset, onRule }: UsageCardProps) {
  const limit = item.kind === "ip" ? limits.ip : limits.client
  const blocked = item.rule === "block"
  const allowed = item.rule === "allow"
  const exceeded = !allowed && limit > 0 && item.recent >= limit
  const reports = item.reports ?? []
  const rest = item.reportTotal - reports.length

  return (
    <section className="flex flex-col gap-4 border border-border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <Badge variant="secondary">{usageKindLabel(item.kind)}</Badge>
          <span className="font-mono text-xs break-all" title={item.value}>
            {usageValueLabel(item)}
          </span>
        </span>
        <Badge variant={blocked ? "destructive" : "secondary"}>
          {usageRuleLabel(item.rule)}
        </Badge>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">窗口内</dt>
        <dd className="tabular-nums">
          <span className={exceeded ? "text-destructive" : undefined}>
            {item.recent}
            {limit > 0 ? ` / ${limit}` : " 次"}
          </span>
          <span className="text-muted-foreground"> · 累计 {item.total} 次</span>
        </dd>

        <dt className="text-muted-foreground">tokens</dt>
        <dd className="tabular-nums">
          {item.tokens.prompt === 0 && item.tokens.completion === 0
            ? "—"
            : `入 ${formatTokens(item.tokens.prompt)} · 出 ${formatTokens(
                item.tokens.completion
              )} · 命中 ${formatTokens(item.tokens.cacheHit)}`}
        </dd>

        <dt className="text-muted-foreground">最近一次</dt>
        <dd className="tabular-nums">
          {item.total > 0 ? formatSavedAt(Date.parse(item.lastAt)) : "—"}
        </dd>

        {item.kind === "client" && (
          <>
            <dt className="text-muted-foreground">浏览器</dt>
            <dd title={item.userAgent}>{browserLabel(item.userAgent)}</dd>

            <dt className="text-muted-foreground">来源 IP</dt>
            <dd className="tabular-nums">{item.ip ?? "不详"}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || item.recent === 0}
          onClick={onReset}
        >
          <RiRefreshLine data-icon="inline-start" />
          清零
        </Button>
        <Button
          variant={allowed ? "default" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => onRule(allowed ? "" : "allow")}
        >
          <RiShieldCheckLine data-icon="inline-start" />
          {allowed ? "取消不限次" : "设为不限次"}
        </Button>
        <Button
          variant={blocked ? "destructive" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => onRule(blocked ? "" : "block")}
        >
          <RiForbid2Line data-icon="inline-start" />
          {blocked ? "取消拉黑" : "拉黑"}
        </Button>
      </div>

      {reports.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">
            名下 {item.reportTotal} 份报告
          </span>
          {reports.map((report) => (
            <span
              key={report.id}
              className="flex flex-wrap items-baseline gap-3"
            >
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatSavedAt(Date.parse(report.createdAt))}
              </span>
              <Link
                to={`/admin/reports/${report.id}`}
                className="font-heading text-sm hover:underline"
              >
                {report.name || "未具名"}
              </Link>
              <Badge variant="secondary">
                {systemMetaOf(report.system).title}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {report.analysisRunes > 0
                  ? `${report.analysisRunes} 字`
                  : "未解读"}
              </span>
            </span>
          ))}
          {rest > 0 && (
            <span className="text-xs text-muted-foreground">
              另有 {rest} 份
            </span>
          )}
        </div>
      )}
    </section>
  )
}
