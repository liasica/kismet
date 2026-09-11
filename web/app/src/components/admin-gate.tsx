import * as React from "react"
import { RiArrowRightLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  fetchAdminReports,
  isHeaderSafe,
  setAdminPassword,
  useAdminPassword,
} from "@/lib/admin"
import { errorMessage } from "@/lib/api"

/** 后台页面的标题行，右侧放页面自己的操作 */
export function AdminHeading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          Admin
        </span>
        <h1 className="font-serif text-2xl tracking-wide">后台管理</h1>
      </div>
      {children}
    </div>
  )
}

/** 后台的密码门：没有密码时显示登录表单，有密码时才渲染页面内容 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const password = useAdminPassword()
  return password ? children : <AdminLogin />
}

/** 登录表单：拿密码试请求一次列表，通过即记住 */
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
      await fetchAdminReports(password, 1)
      setAdminPassword(password)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-10">
      <AdminHeading />
      <form
        className="flex max-w-sm flex-col gap-8"
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
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy || !password}>
            进入
            <RiArrowRightLine />
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </form>
    </section>
  )
}
