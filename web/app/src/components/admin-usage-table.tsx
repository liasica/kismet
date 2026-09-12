import * as React from "react"
import {
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiForbid2Line,
  RiRefreshLine,
  RiShieldCheckLine,
} from "@remixicon/react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  setAdminPassword,
  UnauthorizedError,
  useAdminPassword,
} from "@/lib/admin"
import { errorMessage } from "@/lib/api"
import { formatSavedAt } from "@/lib/reports"
import { systemMetaOf } from "@/lib/system"
import {
  browserLabel,
  fetchUsage,
  formatTokens,
  resetUsage,
  setUsageRule,
  updateQuota,
  USAGE_PAGE_SIZE,
  usageKindLabel,
  usageRuleLabel,
  usageValueLabel,
  type AdminUsage,
  type AdminUsagePage,
  type QuotaLimits,
  type Tokens,
  type UsageReport,
  type UsageRule,
} from "@/lib/usage"

/**
 * 后台的用量一节：额度设置，以及按浏览器指纹与来源 IP 列出的解读次数
 *
 * 每一行可以展开这个主体名下的报告，据此认出它是谁；改处置就地换掉那一行，不重拉整页
 */
export function UsageSection({ page, onGoto }: UsageSectionProps) {
  return <UsageTable key={page} page={page} onGoto={onGoto} />
}

interface UsageSectionProps {
  page: number
  onGoto: (page: number) => void
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; page: AdminUsagePage }
  | { kind: "failed"; message: string }

function UsageTable({ page, onGoto }: UsageSectionProps) {
  const password = useAdminPassword()
  const [state, setState] = React.useState<State>({ kind: "loading" })
  const [busy, setBusy] = React.useState<string>()
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    let cancelled = false
    fetchUsage(password, page)
      .then((result) => {
        if (!cancelled) setState({ kind: "ready", page: result })
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof UnauthorizedError) setAdminPassword("")
        else setState({ kind: "failed", message: errorMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [password, page])

  // 改完就地换掉那一行，不重拉整页，免得排序跳动
  const apply = async (key: string, action: () => Promise<AdminUsage>) => {
    setBusy(key)
    setError(undefined)
    try {
      const updated = await action()
      setState((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              page: {
                ...current.page,
                items: current.page.items.map((item) =>
                  item.key === key ? updated : item
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

  const total = state.kind === "ready" ? state.page.total : undefined
  const pages =
    total === undefined
      ? undefined
      : Math.max(1, Math.ceil(total / USAGE_PAGE_SIZE))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-lg">免费次数</h2>
        {total !== undefined && (
          <span className="text-sm text-muted-foreground">
            共 {total} 个主体
          </span>
        )}
      </div>

      {state.kind === "ready" && (
        <QuotaEditor
          limits={state.page.limits}
          onSaved={(limits) =>
            setState((current) =>
              current.kind === "ready"
                ? { kind: "ready", page: { ...current.page, limits } }
                : current
            )
          }
        />
      )}

      {state.kind === "loading" && (
        <p className="text-sm text-muted-foreground">加载中</p>
      )}
      {state.kind === "failed" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {state.kind === "ready" && state.page.items.length === 0 && (
        <div className="border border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">
            {state.page.total === 0 ? "还没有解读记录" : "这一页没有内容"}
          </p>
        </div>
      )}
      {state.kind === "ready" && state.page.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>主体</TableHead>
              <TableHead>报告</TableHead>
              <TableHead>用量</TableHead>
              <TableHead>tokens</TableHead>
              <TableHead>最近一次</TableHead>
              <TableHead>来源 IP</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.page.items.map((item) => (
              <UsageRow
                key={item.key}
                item={item}
                limits={state.page.limits}
                busy={busy === item.key}
                onReset={() =>
                  void apply(item.key, () => resetUsage(password, item.key))
                }
                onRule={(rule) =>
                  void apply(item.key, () =>
                    setUsageRule(password, item.key, rule)
                  )
                }
              />
            ))}
          </TableBody>
        </Table>
      )}

      {pages !== undefined && pages > 1 && (
        <div className="flex items-center justify-end gap-4 text-sm text-muted-foreground">
          <span className="tabular-nums">
            第 {page} / {pages} 页
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            aria-label="上一页"
            onClick={() => onGoto(page - 1)}
          >
            <RiArrowLeftSLine />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pages}
            aria-label="下一页"
            onClick={() => onGoto(page + 1)}
          >
            <RiArrowRightSLine />
          </Button>
        </div>
      )}
    </section>
  )
}

/** 生效中的额度，就地改，存在服务端不必重启 */
function QuotaEditor({
  limits,
  onSaved,
}: {
  limits: QuotaLimits
  onSaved: (limits: QuotaLimits) => void
}) {
  const password = useAdminPassword()
  const [draft, setDraft] = React.useState(() => draftOf(limits))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const dirty =
    draft.client !== String(limits.client) ||
    draft.ip !== String(limits.ip) ||
    draft.windowHours !== String(limits.windowHours) ||
    draft.whitelistOnly !== limits.whitelistOnly

  const save = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const saved = await updateQuota(password, {
        client: Number(draft.client),
        ip: Number(draft.ip),
        windowHours: Number(draft.windowHours),
        whitelistOnly: draft.whitelistOnly,
      })
      setDraft(draftOf(saved))
      onSaved(saved)
    } catch (e) {
      if (e instanceof UnauthorizedError) setAdminPassword("")
      else setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border border-border p-5">
      <div className="flex flex-wrap items-end gap-6">
        <QuotaField
          id="quota-client"
          label="单个浏览器"
          suffix="次"
          value={draft.client}
          onChange={(client) => setDraft({ ...draft, client })}
        />
        <QuotaField
          id="quota-ip"
          label="单个 IP"
          suffix="次"
          value={draft.ip}
          onChange={(ip) => setDraft({ ...draft, ip })}
        />
        <QuotaField
          id="quota-window"
          label="滚动窗口"
          suffix="小时"
          value={draft.windowHours}
          onChange={(windowHours) => setDraft({ ...draft, windowHours })}
        />
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="quota-whitelist"
            checked={draft.whitelistOnly}
            onCheckedChange={(whitelistOnly) =>
              setDraft({ ...draft, whitelistOnly })
            }
          />
          <FieldLabel
            htmlFor="quota-whitelist"
            className="flex-col items-start gap-1 font-normal"
          >
            仅白名单可解读
            <FieldDescription className="m-0">
              开着时只有设为不限次的主体能解读，其余一律拒绝
            </FieldDescription>
          </FieldLabel>
        </Field>
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          保存
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        次数填 0 即这一层不限；改完对后续请求立刻生效
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function draftOf(limits: QuotaLimits) {
  return {
    client: String(limits.client),
    ip: String(limits.ip),
    windowHours: String(limits.windowHours),
    whitelistOnly: limits.whitelistOnly,
  }
}

interface QuotaFieldProps {
  id: string
  label: string
  suffix: string
  value: string
  onChange: (value: string) => void
}

function QuotaField({ id, label, suffix, value, onChange }: QuotaFieldProps) {
  return (
    <Field className="w-40">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <span className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          className="min-w-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
      </span>
    </Field>
  )
}

/** 累计的模型用量：输入与输出一行，缓存命中与思考一行 */
function TokenCell({ tokens }: { tokens: Tokens }) {
  if (tokens.prompt === 0 && tokens.completion === 0) return "—"

  return (
    <span className="flex flex-col gap-1">
      <span>
        入 {formatTokens(tokens.prompt)} · 出 {formatTokens(tokens.completion)}
      </span>
      <span className="text-xs">
        命中 {formatTokens(tokens.cacheHit)}
        {tokens.reasoning > 0 && ` · 思考 ${formatTokens(tokens.reasoning)}`}
      </span>
    </span>
  )
}

interface UsageRowProps {
  item: AdminUsage
  limits: QuotaLimits
  busy: boolean
  onReset: () => void
  onRule: (rule: UsageRule) => void
}

function UsageRow({ item, limits, busy, onReset, onRule }: UsageRowProps) {
  const [open, setOpen] = React.useState(false)
  const limit = item.kind === "ip" ? limits.ip : limits.client
  const blocked = item.rule === "block"
  const allowed = item.rule === "allow"
  const exceeded = !allowed && limit > 0 && item.recent >= limit
  const reports = item.reports ?? []

  return (
    <>
      <TableRow>
      <TableCell>
        <span className="flex flex-col gap-1">
          <span className="flex items-baseline gap-3">
            <Badge variant="secondary">{usageKindLabel(item.kind)}</Badge>
            <span className="font-mono text-xs" title={item.value}>
              {usageValueLabel(item)}
            </span>
          </span>
          {item.kind === "client" && (
            <span
              className="text-xs text-muted-foreground"
              title={item.userAgent}
            >
              {browserLabel(item.userAgent)}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        {item.reportTotal > 0 ? (
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {item.reportTotal} 份
            <RiArrowDownSLine className={open ? "rotate-180" : undefined} />
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="tabular-nums">
        <span className="flex flex-col gap-1">
          <span className={exceeded ? "text-destructive" : undefined}>
            {item.recent}
            {limit > 0 && ` / ${limit}`}
          </span>
          <span className="text-xs text-muted-foreground">
            累计 {item.total}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        <TokenCell tokens={item.tokens} />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {formatSavedAt(Date.parse(item.lastAt))}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {item.kind === "ip" ? "—" : (item.ip ?? "不详")}
      </TableCell>
      <TableCell>
        <Badge variant={blocked ? "destructive" : "secondary"}>
          {usageRuleLabel(item.rule)}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={busy || item.recent === 0}
            aria-label="清零"
            title="清掉窗口内的计数"
            onClick={onReset}
          >
            <RiRefreshLine />
          </Button>
          <Button
            variant={allowed ? "default" : "outline"}
            size="icon-sm"
            disabled={busy}
            aria-label={allowed ? "取消不限次" : "设为不限次"}
            title={allowed ? "取消不限次" : "设为不限次"}
            onClick={() => onRule(allowed ? "" : "allow")}
          >
            <RiShieldCheckLine />
          </Button>
          <Button
            variant={blocked ? "destructive" : "outline"}
            size="icon-sm"
            disabled={busy}
            aria-label={blocked ? "取消拉黑" : "拉黑"}
            title={blocked ? "取消拉黑" : "拉黑"}
            onClick={() => onRule(blocked ? "" : "block")}
          >
            <RiForbid2Line />
          </Button>
        </span>
      </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/40">
            <UsageReports item={item} reports={reports} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/** 展开后的报告清单，点姓名进报告详情 */
function UsageReports({
  item,
  reports,
}: {
  item: AdminUsage
  reports: UsageReport[]
}) {
  const rest = item.reportTotal - reports.length

  return (
    <span className="flex flex-col gap-2 py-1">
      {reports.map((report) => (
        <span key={report.id} className="flex flex-wrap items-baseline gap-3">
          <span className="text-muted-foreground tabular-nums">
            {formatSavedAt(Date.parse(report.createdAt))}
          </span>
          <Link
            to={`/admin/reports/${report.id}`}
            className="font-heading hover:underline"
          >
            {report.name || "未具名"}
          </Link>
          <Badge variant="secondary">{systemMetaOf(report.system).title}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">
            {report.analysisRunes > 0
              ? `${report.analysisRunes} 字`
              : "未解读"}
          </span>
        </span>
      ))}
      {rest > 0 && (
        <span className="text-xs text-muted-foreground">
          另有 {rest} 份，见下方报告列表
        </span>
      )}
    </span>
  )
}
