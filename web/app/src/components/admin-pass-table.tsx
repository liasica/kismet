import * as React from "react"
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiFileCopyLine,
  RiForbid2Line,
  RiRefreshLine,
} from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  createPasses,
  fetchAdminPasses,
  formatPassCode,
  PASS_PAGE_SIZE,
  passKindLabel,
  setPassDisabled,
  type AdminPass,
  type AdminPassPage,
  type PassKind,
} from "@/lib/pass"
import { formatSavedAt } from "@/lib/reports"
import { browserLabel, formatTokens } from "@/lib/usage"

const KIND_ITEMS: Array<{ value: PassKind; label: string }> = [
  { value: "times", label: "按次数" },
  { value: "allow", label: "不限次" },
]

/**
 * 后台的通行码一节：生成码发给用户，并看各码用掉多少
 *
 * 码由持有者在报告页填上，解读时从码的次数池里扣，不占免费次数；作废就地换掉那一行
 */
export function PassSection({ page, onGoto }: PassSectionProps) {
  return <PassTable key={page} page={page} onGoto={onGoto} />
}

interface PassSectionProps {
  page: number
  onGoto: (page: number) => void
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; page: AdminPassPage }
  | { kind: "failed"; message: string }

function PassTable({ page, onGoto }: PassSectionProps) {
  const password = useAdminPassword()
  const [state, setState] = React.useState<State>({ kind: "loading" })
  const [busy, setBusy] = React.useState<string>()
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    let cancelled = false
    fetchAdminPasses(password, page)
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

  // 作废或恢复就地换掉那一行，不重拉整页
  const apply = async (code: string, disabled: boolean) => {
    setBusy(code)
    setError(undefined)
    try {
      const updated = await setPassDisabled(password, code, disabled)
      setState((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              page: {
                ...current.page,
                passes: current.page.passes.map((item) =>
                  item.code === code ? updated : item
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
      : Math.max(1, Math.ceil(total / PASS_PAGE_SIZE))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-lg">通行码</h2>
        {total !== undefined && (
          <span className="text-sm text-muted-foreground">共 {total} 把</span>
        )}
      </div>

      <PassCreator
        onCreated={(created) => {
          if (page === 1) {
            setState((current) =>
              current.kind === "ready"
                ? {
                    kind: "ready",
                    page: {
                      total: current.page.total + created.length,
                      passes: [...created, ...current.page.passes].slice(
                        0,
                        PASS_PAGE_SIZE
                      ),
                    },
                  }
                : current
            )
          } else {
            onGoto(1)
          }
        }}
      />

      {state.kind === "loading" && (
        <p className="text-sm text-muted-foreground">加载中</p>
      )}
      {state.kind === "failed" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {state.kind === "ready" && state.page.passes.length === 0 && (
        <div className="border border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">
            {state.page.total === 0 ? "还没有生成过通行码" : "这一页没有内容"}
          </p>
        </div>
      )}
      {state.kind === "ready" && state.page.passes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>码</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>用量</TableHead>
              <TableHead>tokens</TableHead>
              <TableHead>最近一次</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.page.passes.map((item) => (
              <PassRow
                key={item.code}
                item={item}
                busy={busy === item.code}
                onDisable={() => void apply(item.code, !item.disabled)}
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

/** 生成通行码，生成后把这一批列出来供抄走 */
function PassCreator({ onCreated }: { onCreated: (passes: AdminPass[]) => void }) {
  const password = useAdminPassword()
  const [kind, setKind] = React.useState<PassKind>("times")
  const [times, setTimes] = React.useState("10")
  const [count, setCount] = React.useState("1")
  const [note, setNote] = React.useState("")
  const [created, setCreated] = React.useState<AdminPass[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()

  const create = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await createPasses(password, {
        kind,
        times: Number(times),
        count: Number(count),
        note: note.trim(),
      })
      setCreated(result.passes)
      setNote("")
      onCreated(result.passes)
    } catch (e) {
      if (e instanceof UnauthorizedError) setAdminPassword("")
      else setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 border border-border p-5">
      <div className="flex flex-wrap items-end gap-6">
        <Field className="w-36">
          <FieldLabel htmlFor="pass-kind">类型</FieldLabel>
          <Select
            items={KIND_ITEMS}
            value={kind}
            onValueChange={(v) => setKind(String(v) as PassKind)}
          >
            <SelectTrigger id="pass-kind" aria-label="通行码类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {kind === "times" && (
          <PassNumberField
            id="pass-times"
            label="次数"
            suffix="次"
            value={times}
            onChange={setTimes}
          />
        )}
        <PassNumberField
          id="pass-count"
          label="生成"
          suffix="把"
          value={count}
          onChange={setCount}
        />
        <Field className="w-56">
          <FieldLabel htmlFor="pass-note">备注</FieldLabel>
          <Input
            id="pass-note"
            placeholder="发给谁"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Button size="sm" disabled={busy} onClick={() => void create()}>
          生成
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {created.length > 0 && <CreatedPasses passes={created} />}
    </div>
  )
}

/** 刚生成的这一批，整批可以一次复制 */
function CreatedPasses({ passes }: { passes: AdminPass[] }) {
  const text = passes.map((item) => formatPassCode(item.code)).join("\n")

  return (
    <div className="flex flex-col gap-2 bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">本次生成 {passes.length} 把</span>
        <CopyButton text={text} label="复制全部" />
      </div>
      <div className="flex flex-col gap-1 font-mono text-sm">
        {passes.map((item) => (
          <span key={item.code}>{formatPassCode(item.code)}</span>
        ))}
      </div>
    </div>
  )
}

interface PassNumberFieldProps {
  id: string
  label: string
  suffix: string
  value: string
  onChange: (value: string) => void
}

function PassNumberField({
  id,
  label,
  suffix,
  value,
  onChange,
}: PassNumberFieldProps) {
  return (
    <Field className="w-32">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <span className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          className="min-w-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
      </span>
    </Field>
  )
}

/** 复制一段文字到剪贴板，复制完短暂换个字样 */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      // 浏览器不给用剪贴板，让用户自己选中复制
    }
  }

  if (!label) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="复制"
        title="复制"
        onClick={() => void copy()}
      >
        <RiFileCopyLine />
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void copy()}>
      <RiFileCopyLine data-icon="inline-start" />
      {done ? "已复制" : label}
    </Button>
  )
}

interface PassRowProps {
  item: AdminPass
  busy: boolean
  onDisable: () => void
}

function PassRow({ item, busy, onDisable }: PassRowProps) {
  const used = item.used > 0

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {formatPassCode(item.code)}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{passKindLabel(item.kind)}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">
        <span className="flex flex-col gap-1">
          <span className={item.valid ? undefined : "text-destructive"}>
            {item.kind === "allow"
              ? `已用 ${item.used}`
              : `${item.used} / ${item.times}`}
          </span>
          {item.clients && item.clients.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {item.clients.length} 个浏览器
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {item.tokens.prompt === 0 && item.tokens.completion === 0 ? (
          "—"
        ) : (
          <span className="flex flex-col gap-1">
            <span>
              入 {formatTokens(item.tokens.prompt)} · 出{" "}
              {formatTokens(item.tokens.completion)}
            </span>
            <span className="text-xs">
              命中 {formatTokens(item.tokens.cacheHit)}
            </span>
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        <span className="flex flex-col gap-1">
          <span>{used ? formatSavedAt(Date.parse(item.lastAt)) : "未用过"}</span>
          {used && (
            <span className="text-xs" title={item.lastUserAgent}>
              {item.lastIp ?? "不详"} · {browserLabel(item.lastUserAgent)}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {item.note || "—"}
      </TableCell>
      <TableCell>
        <Badge variant={item.valid ? "secondary" : "destructive"}>
          {item.valid ? "可用" : (item.reason ?? "不可用")}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="flex items-center justify-end gap-2">
          <CopyButton text={formatPassCode(item.code)} />
          <Button
            variant={item.disabled ? "default" : "outline"}
            size="icon-sm"
            disabled={busy}
            aria-label={item.disabled ? "恢复" : "作废"}
            title={item.disabled ? "恢复" : "作废"}
            onClick={onDisable}
          >
            {item.disabled ? <RiRefreshLine /> : <RiForbid2Line />}
          </Button>
        </span>
      </TableCell>
    </TableRow>
  )
}
