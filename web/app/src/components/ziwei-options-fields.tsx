import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { isInChinaDst } from "@kismet/core"
import type { ZiweiOptions } from "@kismet/core"
import type { Moment } from "@/lib/birth-info"

interface ZiweiOptionsFieldsProps {
  value: ZiweiOptions
  onChange: (value: ZiweiOptions) => void
  /** 表单里当前填的时刻，用来提示夏令时开关是否有效 */
  moment?: Moment
}

/** 紫微排盘的时间规制选项 */
export function ZiweiOptionsFields({
  value,
  onChange,
  moment,
}: ZiweiOptionsFieldsProps) {
  const patch = (part: Partial<ZiweiOptions>) => onChange({ ...value, ...part })

  const dstEffective =
    moment !== undefined &&
    isInChinaDst(moment.year, moment.month, moment.day, moment.hour, moment.minute)

  return (
    <FieldSet>
      <FieldLegend variant="label">时间规制</FieldLegend>
      <FieldGroup className="gap-4">
        <Field orientation="horizontal">
          <Switch
            id="ziwei-true-solar"
            checked={value.useTrueSolarTime}
            onCheckedChange={(v) => patch({ useTrueSolarTime: v })}
          />
          <FieldLabel htmlFor="ziwei-true-solar" className="flex-col items-start gap-1 font-normal">
            真太阳时
            <FieldDescription className="m-0">
              按经度差与均时差校正，需要先选出生地
            </FieldDescription>
          </FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <Switch
            id="ziwei-dst"
            checked={value.useDaylightSaving}
            onCheckedChange={(v) => patch({ useDaylightSaving: v })}
          />
          <FieldLabel htmlFor="ziwei-dst" className="flex-col items-start gap-1 font-normal">
            夏令时
            <FieldDescription className="m-0">
              {dstEffective
                ? "所填时刻在夏令时区间内，开启后回拨一小时"
                : "所填时刻不在 1986 至 1991 年的夏令时区间内，开启无影响"}
            </FieldDescription>
          </FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <Switch
            id="ziwei-late-zi"
            checked={value.lateZiAsNextDay}
            onCheckedChange={(v) => patch({ lateZiAsNextDay: v })}
          />
          <FieldLabel htmlFor="ziwei-late-zi" className="flex-col items-start gap-1 font-normal">
            晚子时算次日
            <FieldDescription className="m-0">
              23:00 至 24:00 出生时，关闭则按当天的农历日期安星
            </FieldDescription>
          </FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
