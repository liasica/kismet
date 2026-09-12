import { RiLogoutBoxRLine } from "@remixicon/react"
import { useSearchParams } from "react-router"

import { AdminGate, AdminHeading } from "@/components/admin-gate"
import { PassSection } from "@/components/admin-pass-table"
import { ReportSection } from "@/components/admin-report-table"
import { UsageSection } from "@/components/admin-usage-table"
import { Button } from "@/components/ui/button"
import { setAdminPassword } from "@/lib/admin"

/**
 * 后台：免费次数、通行码与报告列在同一页，用量那一行展开就是这个主体名下的报告
 *
 * 三张表各自分页，页码分别放在查询参数 `upage`、`ppage` 与 `page` 里
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams()
  const reportPage = pageOf(params.get("page"))
  const usagePage = pageOf(params.get("upage"))
  const passPage = pageOf(params.get("ppage"))

  // 只改一个参数，其余的表留在原来那一页
  const goto = (name: string, value: number) => {
    const next = new URLSearchParams(params)
    if (value > 1) next.set(name, String(value))
    else next.delete(name)
    setParams(next)
  }

  return (
    <AdminGate>
      <div className="flex flex-col gap-12">
        <AdminHeading>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdminPassword("")}
          >
            <RiLogoutBoxRLine data-icon="inline-start" />
            退出
          </Button>
        </AdminHeading>

        <UsageSection
          page={usagePage}
          onGoto={(next) => goto("upage", next)}
        />
        <PassSection page={passPage} onGoto={(next) => goto("ppage", next)} />
        <ReportSection page={reportPage} onGoto={(next) => goto("page", next)} />
      </div>
    </AdminGate>
  )
}

function pageOf(raw: string | null): number {
  return Math.max(1, Math.floor(Number(raw) || 1))
}
