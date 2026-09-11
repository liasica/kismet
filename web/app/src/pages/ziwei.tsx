import * as React from "react"
import { useLocation, useNavigate } from "react-router"

import { BirthForm } from "@/components/birth-form"
import { ZiweiOptionsFields } from "@/components/ziwei-options-fields"
import { useZiweiSession } from "@/components/ziwei-session"
import { ziweiPaipan, type ZiweiOptions } from "@kismet/core"
import {
  INITIAL_BIRTH_INFO,
  parseMoment,
  toPaipanInput,
  type BirthInfo,
} from "@/lib/birth-info"
import { newReportId } from "@/lib/reports"
import { SYSTEMS } from "@/lib/system"
import { INITIAL_ZIWEI_OPTIONS } from "@/lib/ziwei"

export function ZiweiPage() {
  const [session, setSession] = useZiweiSession()
  const navigate = useNavigate()
  const location = useLocation()
  // 草稿只放在组件里，离开表单页即丢；报告页「返回修改」带 edit 进来时用上次提交的值初始化
  const editing = (location.state as { edit?: boolean } | null)?.edit === true
  const [birth, setBirth] = React.useState<BirthInfo>(
    editing ? session.birth : INITIAL_BIRTH_INFO
  )
  const [options, setOptions] = React.useState<ZiweiOptions>(
    editing ? session.options : INITIAL_ZIWEI_OPTIONS
  )
  const [error, setError] = React.useState<string>()

  // 在表单页先排一次盘，越界输入等错误留在表单旁边提示，报告页只管展示
  const submit = () => {
    const input = toPaipanInput(birth)
    if (!input) {
      setError("请先填写出生时间与性别")
      return
    }
    if (options.useTrueSolarTime && input.longitude === undefined) {
      setError("真太阳时需要先选出生地")
      return
    }
    try {
      ziweiPaipan(input, options)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    setError(undefined)
    setSession({
      birth,
      options,
      submittedAt: Date.now(),
      reportId: newReportId(),
    })
    void navigate(SYSTEMS.ziwei.reportPath)
  }

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          {SYSTEMS.ziwei.eyebrow}
        </span>
        <h1 className="font-serif text-2xl tracking-wide">
          {SYSTEMS.ziwei.title}
        </h1>
      </div>

      <BirthForm
        value={birth}
        onChange={setBirth}
        onSubmit={submit}
        submitLabel="排盘"
        error={error}
      >
        <ZiweiOptionsFields
          value={options}
          onChange={setOptions}
          moment={parseMoment(birth.date, birth.time)}
        />
      </BirthForm>
    </section>
  )
}
