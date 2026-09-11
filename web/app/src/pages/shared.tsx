import * as React from "react"
import { RiArrowRightLine } from "@remixicon/react"
import { Link, useParams } from "react-router"

import { ReportView } from "@/components/report-view"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/api"
import { fetchShared, unlockShared, type SharedReport } from "@/lib/share"
import { SYSTEMS, isSystem } from "@/lib/system"

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "locked" }
  | { kind: "ready"; report: SharedReport }
  | { kind: "failed"; message: string }

/**
 * 分享页：按链接里的哈希取服务端保存的报告，在本地重新排盘并展示保存的解读
 *
 * 设了密码的分享先输密码；链接不存在或已取消分享时提示并引导去排盘
 */
export function SharedPage() {
  const { hash = "" } = useParams()
  const [state, setState] = React.useState<State>({ kind: "loading" })

  React.useEffect(() => {
    let cancelled = false
    fetchShared(hash)
      .then((view) => {
        if (cancelled) return
        if (!view) setState({ kind: "missing" })
        else if (view.report) setState({ kind: "ready", report: view.report })
        else setState({ kind: "locked" })
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: "failed", message: errorMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [hash])

  // 报告取回来之前不知道体系，标题先用通称
  const system =
    state.kind === "ready" && isSystem(state.report.system)
      ? state.report.system
      : undefined
  const meta = system
    ? SYSTEMS[system]
    : { eyebrow: "Shared Report", title: "分享的报告", path: "/" }

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            {meta.eyebrow}
          </span>
          <h1 className="font-serif text-2xl tracking-wide">{meta.title}</h1>
        </div>
        <Link
          to={meta.path}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          我也排一盘
          <RiArrowRightLine data-icon="inline-end" />
        </Link>
      </div>

      {state.kind === "loading" && (
        <p className="text-sm text-muted-foreground">加载中</p>
      )}
      {state.kind === "failed" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.kind === "missing" && (
        <div className="flex flex-col items-start gap-4 border border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">
            链接不存在，或分享已被取消。
          </p>
          <Link to="/" className={buttonVariants({ size: "sm" })}>
            去排盘
            <RiArrowRightLine data-icon="inline-end" />
          </Link>
        </div>
      )}
      {state.kind === "locked" && (
        <UnlockForm
          hash={hash}
          onUnlock={(report) => setState({ kind: "ready", report })}
        />
      )}
      {state.kind === "ready" && (
        <ReportView
          system={system ?? "bazi"}
          input={state.report.input}
          options={state.report.options}
          analysis={state.report.analysis}
          updatedAt={state.report.updatedAt}
        />
      )}
    </section>
  )
}

interface UnlockFormProps {
  hash: string
  onUnlock: (report: SharedReport) => void
}

function UnlockForm({ hash, onUnlock }: UnlockFormProps) {
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      onUnlock(await unlockShared(hash, password))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex max-w-sm flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="share-password">密码</FieldLabel>
          <Input
            id="share-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldDescription>这份报告设了密码，输入后查看</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={busy || !password}>
          查看
          <RiArrowRightLine />
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  )
}
