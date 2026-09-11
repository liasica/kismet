import * as React from "react"
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiLogoutBoxRLine,
} from "@remixicon/react"
import { Link, useNavigate, useSearchParams } from "react-router"

import { AdminGate, AdminHeading } from "@/components/admin-gate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchAdminReports,
  formatBirth,
  PAGE_SIZE,
  setAdminPassword,
  UnauthorizedError,
  useAdminPassword,
  type AdminReportPage,
} from "@/lib/admin"
import { errorMessage } from "@/lib/api"
import { formatSavedAt } from "@/lib/reports"
import type { ShareInfo } from "@/lib/share"
import { systemMetaOf } from "@/lib/system"

/**
 * 后台首页：服务端保存的全部报告，按创建时间倒序分页，点一行进详情
 *
 * 页码放在查询参数里，从详情返回时仍在原来那一页；换页以页码为 key 重建表格
 */
export function AdminReportsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1))

  return (
    <AdminGate>
      <ReportTable
        key={page}
        page={page}
        onGoto={(next) => setParams(next > 1 ? { page: String(next) } : {})}
      />
    </AdminGate>
  )
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; page: AdminReportPage }
  | { kind: "failed"; message: string }

/** 详情路径带上当前页码，详情页据此拼「返回列表」的链接 */
function detailPath(id: string, page: number): string {
  return page > 1 ? `/admin/reports/${id}?page=${page}` : `/admin/reports/${id}`
}

function shareLabel(share: ShareInfo | undefined): string {
  if (!share) return "未分享"
  return share.locked ? "已分享，有密码" : "已分享"
}

interface ReportTableProps {
  page: number
  onGoto: (page: number) => void
}

function ReportTable({ page, onGoto }: ReportTableProps) {
  const password = useAdminPassword()
  const navigate = useNavigate()
  const [state, setState] = React.useState<State>({ kind: "loading" })

  React.useEffect(() => {
    let cancelled = false
    fetchAdminReports(password, page)
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

  const total = state.kind === "ready" ? state.page.total : undefined
  const pages =
    total === undefined ? undefined : Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="flex flex-col gap-8">
      <AdminHeading>
        <div className="flex items-center gap-4">
          {total !== undefined && (
            <span className="text-sm text-muted-foreground">共 {total} 份</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdminPassword("")}
          >
            <RiLogoutBoxRLine data-icon="inline-start" />
            退出
          </Button>
        </div>
      </AdminHeading>

      {state.kind === "loading" && (
        <p className="text-sm text-muted-foreground">加载中</p>
      )}
      {state.kind === "failed" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.kind === "ready" && state.page.reports.length === 0 && (
        <div className="border border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">
            {state.page.total === 0 ? "还没有报告" : "这一页没有内容"}
          </p>
        </div>
      )}
      {state.kind === "ready" && state.page.reports.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>创建时间</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>体系</TableHead>
              <TableHead>出生时刻</TableHead>
              <TableHead>出生地</TableHead>
              <TableHead>解读</TableHead>
              <TableHead>分享</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.page.reports.map((report) => (
              <TableRow
                key={report.id}
                className="cursor-pointer"
                onClick={() => void navigate(detailPath(report.id, page))}
              >
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatSavedAt(Date.parse(report.createdAt))}
                </TableCell>
                <TableCell>
                  <span className="flex items-baseline gap-3">
                    <Link
                      to={detailPath(report.id, page)}
                      className="font-heading hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {report.input.name || "未具名"}
                    </Link>
                    <Badge variant="secondary">
                      {report.input.gender === "male" ? "乾造" : "坤造"}
                    </Badge>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {systemMetaOf(report.system).title}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatBirth(report.input)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="block max-w-48 truncate">
                    {report.input.location || "不详"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {report.analysisRunes > 0
                    ? `${report.analysisRunes} 字`
                    : "未解读"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {shareLabel(report.share)}
                </TableCell>
              </TableRow>
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
