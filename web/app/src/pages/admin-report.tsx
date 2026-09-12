import * as React from "react"
import { RiArrowLeftLine } from "@remixicon/react"
import { Link, useParams, useSearchParams } from "react-router"

import { AdminGate, AdminHeading } from "@/components/admin-gate"
import { ReportView } from "@/components/report-view"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  fetchAdminReport,
  setAdminPassword,
  UnauthorizedError,
  useAdminPassword,
  type AdminReport,
} from "@/lib/admin"
import { errorMessage } from "@/lib/api"
import { formatSavedAt } from "@/lib/reports"
import { shareUrlOf } from "@/lib/share"
import { isSystem, systemMetaOf } from "@/lib/system"
import { browserLabel } from "@/lib/usage"

/** 后台的报告详情：服务端信息、按保存的输入重新排的命盘与解读正文 */
export function AdminReportPage() {
  const { id = "" } = useParams()

  return (
    <AdminGate>
      <ReportDetail key={id} id={id} />
    </AdminGate>
  )
}

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; report: AdminReport }
  | { kind: "failed"; message: string }

function ReportDetail({ id }: { id: string }) {
  const password = useAdminPassword()
  const [params] = useSearchParams()
  const [state, setState] = React.useState<State>({ kind: "loading" })
  // 从列表进来时带着页码，返回时回到原来那一页
  const page = params.get("page")
  const listPath = page ? `/admin?page=${page}` : "/admin"

  React.useEffect(() => {
    let cancelled = false
    fetchAdminReport(password, id)
      .then((report) => {
        if (cancelled) return
        setState(report ? { kind: "ready", report } : { kind: "missing" })
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

  return (
    <section className="flex flex-col gap-10">
      <AdminHeading>
        <Link
          to={listPath}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <RiArrowLeftLine data-icon="inline-start" />
          返回列表
        </Link>
      </AdminHeading>

      {state.kind === "loading" && (
        <p className="text-sm text-muted-foreground">加载中</p>
      )}
      {state.kind === "failed" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.kind === "missing" && (
        <p className="text-sm text-muted-foreground">报告不存在</p>
      )}
      {state.kind === "ready" && (
        <>
          <ReportMeta report={state.report} />
          {isSystem(state.report.system) ? (
            <ReportView
              system={state.report.system}
              input={state.report.input}
              options={state.report.options}
              analysis={state.report.analysis}
              updatedAt={state.report.updatedAt}
            />
          ) : (
            <p className="text-sm text-destructive">
              这份报告的体系无法识别，无法显示
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** 报告在服务端的信息：id、时间、模型、来源客户端与分享状态 */
function ReportMeta({ report }: { report: AdminReport }) {
  const share = report.share
  const client = report.client
  const rows: Array<[string, React.ReactNode]> = [
    ["报告 id", <span className="font-mono text-xs">{report.id}</span>],
    ["体系", systemMetaOf(report.system).title],
    ["创建于", formatSavedAt(Date.parse(report.createdAt))],
    ["更新于", formatSavedAt(Date.parse(report.updatedAt))],
    ["模型", report.model || "未记录"],
    ["来源 IP", client?.ip || "未记录"],
    [
      "浏览器",
      client?.userAgent ? (
        <span title={client.userAgent}>{browserLabel(client.userAgent)}</span>
      ) : (
        "未记录"
      ),
    ],
    [
      "指纹",
      client?.fingerprint ? (
        <span className="font-mono text-xs">{client.fingerprint}</span>
      ) : (
        "未记录"
      ),
    ],
    [
      "分享",
      share ? (
        <span className="flex flex-wrap items-baseline gap-3">
          <Link to={`/s/${share.hash}`} className="hover:underline">
            {shareUrlOf(share.hash)}
          </Link>
          {share.locked && <Badge variant="secondary">有密码</Badge>}
        </span>
      ) : (
        "未分享"
      ),
    ],
  ]

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-all">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
