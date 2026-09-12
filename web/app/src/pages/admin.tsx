import { RiLogoutBoxRLine } from "@remixicon/react"
import { cn } from "cn"
import { NavLink, Outlet } from "react-router"

import { AdminGate, AdminHeading } from "@/components/admin-gate"
import { Button } from "@/components/ui/button"
import { setAdminPassword } from "@/lib/admin"

const TABS: Array<{ to: string; label: string }> = [
  { to: "/admin/settings", label: "设置" },
  { to: "/admin/reports", label: "报告" },
  { to: "/admin/usage", label: "用量" },
  { to: "/admin/passes", label: "Key" },
]

/** 后台的外框：密码门、标题、四个页面的导航，内容由各页面填 */
export function AdminLayout() {
  return (
    <AdminGate>
      <div className="flex flex-col gap-10">
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

        <nav className="flex items-center gap-8 border-b border-border">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "-mb-px border-b-2 pb-3 text-sm transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </AdminGate>
  )
}
