import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { isInChinaDst } from "@kismet/core"
import type { BaziOptions, QiYunPrecision } from "@kismet/core"
import type { Moment } from "@/lib/birth-info"

const QI_YUN_ITEMS = [
  { value: "day", label: "折到日" },
  { value: "hour", label: "折到时辰" },
]

interface BaziOptionsFieldsProps {
  value: BaziOptions
  onChange: (value: BaziOptions) => void
  /** 表单里当前填的时刻，用来提示夏令时开关是否有效 */
  moment?: Moment
}

/** 八字排盘的时间规制选项 */
export function BaziOptionsFields({
  value,
  onChange,
  moment,
}: BaziOptionsFieldsProps) {
  const patch = (part: Partial<BaziOptions>) => onChange({ ...value, ...part })

  // 夏令时开关只在 1986 至 1991 年的区间内有效果，其余时候标出来
  const dstEffective =
    moment !== undefined &&
    isInChinaDst(
      moment.year,
      moment.month,
      moment.day,
      moment.hour,
      moment.minute
    )

  return (
    <FieldSet>
      <FieldLegend variant="label">时间规制</FieldLegend>
      <FieldGroup className="gap-4">
        <Field orientation="horizontal">
          <Switch
            id="true-solar"
            checked={value.useTrueSolarTime}
            onCheckedChange={(v) => patch({ useTrueSolarTime: v })}
          />
          <FieldLabel htmlFor="true-solar" className="flex-col items-start gap-1 font-normal">
            真太阳时
            <FieldDescription className="m-0">
              按经度差与均时差校正，需要先选出生地
            </FieldDescription>
          </FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <Switch
            id="dst"
            checked={value.useDaylightSaving}
            onCheckedChange={(v) => patch({ useDaylightSaving: v })}
          />
          <FieldLabel htmlFor="dst" className="flex-col items-start gap-1 font-normal">
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
            id="late-zi"
            checked={value.lateZiAsNextDay}
            onCheckedChange={(v) => patch({ lateZiAsNextDay: v })}
          />
          <FieldLabel htmlFor="late-zi" className="flex-col items-start gap-1 font-normal">
            晚子时算次日
            <FieldDescription className="m-0">
              23:00 至 24:00 出生时，关闭则日柱用当天并按当天日干推时干
            </FieldDescription>
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel>起运折算</FieldLabel>
          <Select
            items={QI_YUN_ITEMS}
            value={value.qiYunPrecision}
            onValueChange={(v) =>
              patch({ qiYunPrecision: String(v) as QiYunPrecision })
            }
          >
            <SelectTrigger
              className="min-w-28"
              size="sm"
              aria-label="起运折算精度"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QI_YUN_ITEMS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
