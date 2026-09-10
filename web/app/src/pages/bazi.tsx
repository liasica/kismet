import * as React from "react"
import { useNavigate } from "react-router"

import { BaziOptionsFields } from "@/components/bazi-options-fields"
import { useBaziSession } from "@/components/bazi-session"
import { BirthForm } from "@/components/birth-form"
import { paipan } from "@kismet/core"
import { toPaipanInput } from "@/lib/bazi"
import { parseMoment } from "@/lib/birth-info"
import { newReportId } from "@/lib/reports"

export function BaziPage() {
  const [session, setSession] = useBaziSession()
  const navigate = useNavigate()
  const [error, setError] = React.useState<string>()

  // 在表单页先排一次盘，越界输入等错误留在表单旁边提示，报告页只管展示
  const submit = () => {
    const input = toPaipanInput(session.birth)
    if (!input) {
      setError("请先填写出生时间与性别")
      return
    }
    if (session.options.useTrueSolarTime && input.longitude === undefined) {
      setError("真太阳时需要先选出生地")
      return
    }
    try {
      paipan(input, session.options)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    setError(undefined)
    setSession({ ...session, submittedAt: Date.now(), reportId: newReportId() })
    void navigate("/bazi/report")
  }

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          Four Pillars
        </span>
        <h1 className="font-serif text-2xl tracking-wide">八字命理</h1>
      </div>

      <BirthForm
        value={session.birth}
        onChange={(birth) => setSession({ ...session, birth })}
        onSubmit={submit}
        submitLabel="排盘"
        error={error}
      >
        <BaziOptionsFields
          value={session.options}
          onChange={(options) => setSession({ ...session, options })}
          moment={parseMoment(session.birth.date, session.birth.time)}
        />
      </BirthForm>
    </section>
  )
}
