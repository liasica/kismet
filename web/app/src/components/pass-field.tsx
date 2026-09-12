import * as React from "react"
import { RiCloseLine, RiKey2Line } from "@remixicon/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/api"
import {
  fetchPass,
  formatPassCode,
  normalizePassCode,
  passLeftLabel,
  setPass,
  usePass,
  type PassInfo,
} from "@/lib/pass"

interface PassFieldProps {
  /** 输入框是否展开，免费次数不够时由父组件打开 */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 换个值就重查剩余次数，一次解读结束后由父组件递增 */
  reload?: number
}

/**
 * 通行码：填上一把码，解读就从码的次数里扣，不再受免费次数限制
 *
 * 码存在浏览器本地，解读请求自动带上。已填的码在这里显示剩余次数，也可以移除换一把
 */
export function PassField({ open, onOpenChange, reload }: PassFieldProps) {
  const code = usePass()
  // 查回来的码状态，换了一把码之后这一份就不作数
  const [checked, setChecked] = React.useState<PassInfo>()
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const info = checked?.code === code ? checked : undefined

  // 每次进来与每次解读结束都查一遍，剩余次数跟服务端一致
  React.useEffect(() => {
    if (!code) return

    let cancelled = false
    fetchPass(code)
      .then((result) => {
        if (cancelled) return
        if (result) setChecked(result)
        else setPass("")
      })
      .catch(() => {
        // 查不到就先按本地这份用着，解读时服务端还会再判一次
      })
    return () => {
      cancelled = true
    }
  }, [code, reload])

  const submit = async () => {
    const next = normalizePassCode(draft)
    if (!next) return

    setBusy(true)
    setError(undefined)
    try {
      const result = await fetchPass(next)
      if (!result) {
        setError("通行码无效")
        return
      }
      if (!result.valid) {
        setError(result.reason ?? "通行码不能用了")
        return
      }
      setChecked(result)
      setPass(next)
      setDraft("")
      onOpenChange(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (code) {
    return (
      <p className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="secondary">
          <RiKey2Line data-icon="inline-start" />
          通行码
        </Badge>
        <span className="font-mono text-xs">{formatPassCode(code)}</span>
        <span className="text-muted-foreground">
          {info ? passLeftLabel(info) : "核对中"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="移除通行码"
          title="移除通行码"
          onClick={() => setPass("")}
        >
          <RiCloseLine />
        </Button>
      </p>
    )
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={() => onOpenChange(true)}
      >
        <RiKey2Line data-icon="inline-start" />
        使用通行码
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          autoFocus
          className="w-64 font-mono"
          placeholder="通行码"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
          使用
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft("")
            setError(undefined)
            onOpenChange(false)
          }}
        >
          取消
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
