import { RiArrowRightLine } from "@remixicon/react"
import { Link } from "react-router"

import { useBaziSession } from "@/components/bazi-session"
import { SavedReportCard } from "@/components/saved-report-card"
import { buttonVariants } from "@/components/ui/button"
import { useZiweiSession } from "@/components/ziwei-session"
import { deleteReport, useReports, type SavedReport } from "@/lib/reports"

/** 收藏页：已收藏的报告以卡片列出，点开按原表单值重新排盘并展示保存的解读 */
export function SavedPage() {
  const reports = useReports()
  const [, setBaziSession] = useBaziSession()
  const [, setZiweiSession] = useZiweiSession()

  const open = (report: SavedReport) => {
    const session = {
      birth: report.birth,
      submittedAt: Date.now(),
      reportId: report.id,
    }
    if (report.system === "ziwei") {
      setZiweiSession({ ...session, options: report.options })
    } else {
      setBaziSession({ ...session, options: report.options })
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            Collection
          </span>
          <h1 className="font-serif text-2xl tracking-wide">收藏</h1>
        </div>
        {reports.length > 0 && (
          <span className="text-sm text-muted-foreground">
            共 {reports.length} 份
          </span>
        )}
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border border-dashed border-border p-8">
          <p className="text-sm text-muted-foreground">
            还没有收藏的报告。排盘后在报告页点「收藏」，解读完成也会自动收藏。
          </p>
          <Link to="/" className={buttonVariants({ size: "sm" })}>
            去排盘
            <RiArrowRightLine data-icon="inline-end" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {reports.map((report, index) => (
            <SavedReportCard
              key={report.id}
              report={report}
              index={index}
              onOpen={open}
              onDelete={deleteReport}
            />
          ))}
        </div>
      )}
    </section>
  )
}
