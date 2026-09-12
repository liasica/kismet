import { PassSection } from "@/components/admin-pass-table"
import { usePageParam } from "@/lib/admin"

/** 后台的 Key 页：生成通行码并看各码用掉多少 */
export function AdminPassesPage() {
  const [page, goto] = usePageParam()
  return <PassSection page={page} onGoto={goto} />
}
