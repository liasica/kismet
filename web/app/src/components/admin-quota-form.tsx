import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  setAdminPassword,
  UnauthorizedError,
  useAdminPassword,
} from "@/lib/admin"
import { errorMessage } from "@/lib/api"
import { fetchQuota, updateQuota, type QuotaLimits } from "@/lib/usage"

/**
 * 后台的设置页：免费解读次数的额度、滚动窗口与仅白名单开关
 *
 * 存在服务端的数据文件里，保存后对后续请求立刻生效，不经环境变量也不必重启
 */
export function QuotaForm() {
  const password = useAdminPassword()
  const [limits, setLimits] = React.useState<QuotaLimits>()
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    let cancelled = false
    fetchQuota(password)
      .then((result) => {
        if (!cancelled) setLimits(result)
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof UnauthorizedError) setAdminPassword("")
        else setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [password])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!limits) return <p className="text-sm text-muted-foreground">加载中</p>
  return <QuotaFields limits={limits} onSaved={setLimits} />
}

interface QuotaFieldsProps {
  limits: QuotaLimits
  onSaved: (limits: QuotaLimits) => void
}

function QuotaFields({ limits, onSaved }: QuotaFieldsProps) {
  const password = useAdminPassword()
  const [draft, setDraft] = React.useState(() => draftOf(limits))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const dirty =
    draft.client !== String(limits.client) ||
    draft.ip !== String(limits.ip) ||
    draft.windowHours !== String(limits.windowHours) ||
    draft.whitelistOnly !== limits.whitelistOnly

  const save = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const saved = await updateQuota(password, {
        client: Number(draft.client),
        ip: Number(draft.ip),
        windowHours: Number(draft.windowHours),
        whitelistOnly: draft.whitelistOnly,
      })
      setDraft(draftOf(saved))
      onSaved(saved)
    } catch (e) {
      if (e instanceof UnauthorizedError) setAdminPassword("")
      else setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex max-w-lg flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <FieldGroup>
        <QuotaField
          id="quota-client"
          label="单个浏览器"
          suffix="次"
          description="按浏览器指纹计，取不到指纹时整个 IP 当一个客户端"
          value={draft.client}
          onChange={(client) => setDraft({ ...draft, client })}
        />
        <QuotaField
          id="quota-ip"
          label="单个 IP"
          suffix="次"
          description="同一出口的兜底阀，填 0 即这一层不限"
          value={draft.ip}
          onChange={(ip) => setDraft({ ...draft, ip })}
        />
        <QuotaField
          id="quota-window"
          label="滚动窗口"
          suffix="小时"
          description="窗口外的调用不再计入次数"
          value={draft.windowHours}
          onChange={(windowHours) => setDraft({ ...draft, windowHours })}
        />
        <Field orientation="horizontal">
          <Switch
            id="quota-whitelist"
            checked={draft.whitelistOnly}
            onCheckedChange={(whitelistOnly) =>
              setDraft({ ...draft, whitelistOnly })
            }
          />
          <FieldLabel
            htmlFor="quota-whitelist"
            className="flex-col items-start gap-1 font-normal"
          >
            仅白名单可解读
            <FieldDescription className="m-0">
              开着时只有设为不限次的主体能解读，其余一律拒绝
            </FieldDescription>
          </FieldLabel>
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={!dirty || busy}>
          保存
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  )
}

function draftOf(limits: QuotaLimits) {
  return {
    client: String(limits.client),
    ip: String(limits.ip),
    windowHours: String(limits.windowHours),
    whitelistOnly: limits.whitelistOnly,
  }
}

interface QuotaFieldProps {
  id: string
  label: string
  suffix: string
  description: string
  value: string
  onChange: (value: string) => void
}

function QuotaField({
  id,
  label,
  suffix,
  description,
  value,
  onChange,
}: QuotaFieldProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <span className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          className="w-32"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
      </span>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  )
}
