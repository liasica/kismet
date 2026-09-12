import * as React from "react"
import { RiArrowRightLine } from "@remixicon/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { isHeaderSafe, setAdminPassword, useAdminPassword } from "@/lib/admin"
import { errorMessage } from "@/lib/api"
import { fetchQuota } from "@/lib/usage"

/** 后台页面的标题行，右侧放页面自己的操作 */
export function AdminHeading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <AdminTitle />
      {children}
    </div>
  )
}

/** 后台的眉题与标题 */
function AdminTitle({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
        Admin
      </span>
      <h1 className="font-serif text-2xl tracking-wide">后台管理</h1>
    </div>
  )
}

/** 后台的密码门：没有密码时显示登录表单，有密码时才渲染页面内容 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const password = useAdminPassword()
  return password ? children : <AdminLogin />
}

/** 登录表单：拿密码试取一次额度，通过即记住；整屏居中 */
function AdminLogin() {
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()

  const submit = async () => {
    if (!isHeaderSafe(password)) {
      setError("密码只能含 ASCII 可见字符")
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await fetchQuota(password)
      setAdminPassword(password)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-10">
      <AdminTitle className="items-center" />
      <form
        className="flex w-full max-w-sm flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="admin-password">管理密码</FieldLabel>
            <Input
              id="admin-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldDescription>
              服务端环境变量 ADMIN_PASSWORD 的值
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-col items-center gap-3">
          <Button type="submit" className="w-full" disabled={busy || !password}>
            进入
            <RiArrowRightLine />
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </form>
    </section>
  )
}
