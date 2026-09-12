import { ReportSection } from "@/components/admin-report-table"
import { usePageParam } from "@/lib/admin"

/** 后台的报告页：服务端保存的全部报告 */
export function AdminReportsPage() {
  const [page, goto] = usePageParam()
  return <ReportSection page={page} onGoto={goto} />
}
