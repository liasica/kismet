import * as React from "react"
import {
  RiCheckLine,
  RiDownloadLine,
  RiFileCopyLine,
  RiImageLine,
  RiShareLine,
} from "@remixicon/react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Chart } from "@kismet/core"
import { errorMessage } from "@/lib/api"
import { renderPoster } from "@/lib/poster"
import {
  createShare,
  fetchShare,
  revokeShare,
  shareUrlOf,
  type ShareInfo,
} from "@/lib/share"

/** 分享状态：`undefined` 还没查回来，`null` 未分享 */
type ShareState = ShareInfo | null | undefined

interface ShareDialogProps {
  reportId: string
  chart: Chart
  /** 最新的解读正文，整段排进长图 */
  analysis: string
}

/**
 * 分享：链接与图片两个标签页
 *
 * 链接指向服务端保存的这份报告，可设密码；图片是本地画的长图，含命盘与完整解读，有链接时附二维码
 */
export function ShareDialog({ reportId, chart, analysis }: ShareDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [share, setShare] = React.useState<ShareState>()
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchShare(reportId)
      .then((info) => {
        if (!cancelled) setShare(info ?? null)
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [open, reportId])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setShare(undefined)
        setError(undefined)
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <RiShareLine data-icon="inline-start" />
        分享
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>分享</DialogTitle>
          <DialogDescription>
            链接打开的是服务端保存的这份报告，重新解读后内容同步更新
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link">
          <TabsList>
            <TabsTrigger value="link">链接</TabsTrigger>
            <TabsTrigger value="image">图片</TabsTrigger>
          </TabsList>
          <TabsContent value="link" className="pt-4">
            <LinkPanel
              reportId={reportId}
              chart={chart}
              analysis={analysis}
              share={share}
              onChange={setShare}
            />
          </TabsContent>
          <TabsContent value="image" className="pt-4">
            <PosterPanel chart={chart} analysis={analysis} share={share} />
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}

interface LinkPanelProps {
  reportId: string
  chart: Chart
  analysis: string
  share: ShareState
  onChange: (share: ShareInfo | null) => void
}

/** 链接：创建、改密码、取消，链接一栏可一键复制；创建时把本地的解读正文一并送到服务端 */
function LinkPanel({
  reportId,
  chart,
  analysis,
  share,
  onChange,
}: LinkPanelProps) {
  // 密码开关未动过时跟随服务端的状态
  const [usePassword, setUsePassword] = React.useState<boolean>()
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [copied, setCopied] = React.useState(false)

  const locked = usePassword ?? share?.locked ?? false
  const url = share ? shareUrlOf(share.hash) : undefined

  const submit = async () => {
    if (locked && !password) {
      setError("请输入密码")
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      onChange(
        await createShare(reportId, {
          input: chart.input,
          options: chart.options,
          analysis,
          password: locked ? password : "",
        })
      )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await revokeShare(reportId)
      onChange(null)
      setUsePassword(undefined)
      setPassword("")
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("复制失败，请选中链接手动复制")
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {url && (
        <InputGroup>
          <InputGroupInput
            readOnly
            value={url}
            aria-label="分享链接"
            onFocus={(e) => e.currentTarget.select()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={() => void copy()}>
              {copied ? <RiCheckLine /> : <RiFileCopyLine />}
              {copied ? "已复制" : "复制"}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}

      <FieldGroup className="gap-4">
        <Field orientation="horizontal">
          <Switch
            id="share-lock"
            checked={locked}
            disabled={share === undefined}
            onCheckedChange={(v) => setUsePassword(v)}
          />
          <FieldLabel
            htmlFor="share-lock"
            className="flex-col items-start gap-1 font-normal"
          >
            需要密码
            <FieldDescription className="m-0">
              {share?.locked
                ? "已设密码，打开链接时先输入"
                : "打开链接时先输入密码"}
            </FieldDescription>
          </FieldLabel>
        </Field>

        {locked && (
          <Field>
            <FieldLabel htmlFor="share-password">密码</FieldLabel>
            <Input
              id="share-password"
              value={password}
              autoComplete="off"
              placeholder={share?.locked ? "输入新密码" : "最长 64 个字符"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || share === undefined}>
          {share ? "更新密码" : "创建链接"}
        </Button>
        {share && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void revoke()}
          >
            取消分享
          </Button>
        )}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  )
}

interface PosterPanelProps {
  chart: Chart
  analysis: string
  share: ShareState
}

interface Poster {
  blob: Blob
  url: string
}

/** 图片：本地画好长图后预览，可下载、复制到剪贴板或调系统分享 */
function PosterPanel({ chart, analysis, share }: PosterPanelProps) {
  const [poster, setPoster] = React.useState<Poster>()
  const [error, setError] = React.useState<string>()
  const [notice, setNotice] = React.useState<string>()

  const loaded = share !== undefined
  const shareUrl = share ? shareUrlOf(share.hash) : undefined

  // 等分享状态查回来再画，免得二维码画两遍
  React.useEffect(() => {
    if (!loaded) return
    let cancelled = false
    renderPoster(chart, { shareUrl, analysis })
      .then((blob) => {
        if (!cancelled) setPoster({ blob, url: URL.createObjectURL(blob) })
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [chart, shareUrl, analysis, loaded])

  React.useEffect(
    () => () => {
      if (poster) URL.revokeObjectURL(poster.url)
    },
    [poster]
  )

  const fileName = `${chart.name || "八字"}-命盘.png`
  const canCopy =
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  const canShare = typeof navigator.share === "function"

  const copy = async () => {
    if (!poster) return
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": poster.blob }),
      ])
      setNotice("已复制到剪贴板")
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const shareFile = async () => {
    if (!poster) return
    const file = new File([poster.blob], fileName, { type: "image/png" })
    if (!navigator.canShare?.({ files: [file] })) {
      setError("当前浏览器不支持分享图片文件，请下载后发送")
      return
    }
    try {
      await navigator.share({ files: [file], title: fileName })
    } catch (e) {
      // 用户关闭分享面板不算错误
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(errorMessage(e))
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-[55vh] overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_1rem,black_calc(100%_-_1rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {poster ? (
          <img
            src={poster.url}
            alt="命盘海报"
            className="w-full border border-border"
          />
        ) : (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            {error ?? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                生成中
              </>
            )}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {share
          ? "图片左下角是分享链接的二维码"
          : "创建分享链接后，图片会附带二维码"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={poster?.url}
          download={fileName}
          aria-disabled={!poster}
          className={buttonVariants({
            size: "sm",
            className: poster ? undefined : "pointer-events-none opacity-50",
          })}
        >
          <RiDownloadLine data-icon="inline-start" />
          下载
        </a>
        {canCopy && (
          <Button
            variant="outline"
            size="sm"
            disabled={!poster}
            onClick={() => void copy()}
          >
            <RiImageLine data-icon="inline-start" />
            复制图片
          </Button>
        )}
        {canShare && (
          <Button
            variant="outline"
            size="sm"
            disabled={!poster}
            onClick={() => void shareFile()}
          >
            <RiShareLine data-icon="inline-start" />
            分享
          </Button>
        )}
        {(notice || (poster && error)) && (
          <span
            className={
              error ? "text-sm text-destructive" : "text-sm text-muted-foreground"
            }
          >
            {error ?? notice}
          </span>
        )}
      </div>
    </div>
  )
}
