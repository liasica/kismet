import { QuotaForm } from "@/components/admin-quota-form"

/** 后台的设置页：免费解读次数的额度与窗口 */
export function AdminSettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-lg">免费次数</h2>
      <QuotaForm />
    </section>
  )
}
