import { UsageSection } from "@/components/admin-usage-table"
import { usePageParam } from "@/lib/admin"

/** 后台的用量页：各浏览器与各 IP 的解读次数 */
export function AdminUsagePage() {
  const [page, goto] = usePageParam()
  return <UsageSection page={page} onGoto={goto} />
}
