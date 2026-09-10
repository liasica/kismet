import * as React from "react"
import { RiArrowRightLine } from "@remixicon/react"

import { DateTimePicker } from "@/components/date-time-picker"
import { RegionCascader } from "@/components/region-cascader"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { Gender } from "@kismet/core"
import {
  birthplaceOf,
  locationNameOf,
  parseMoment,
  type BirthInfo,
} from "@/lib/birth-info"

interface BirthFormProps {
  value: BirthInfo
  onChange: (value: BirthInfo) => void
  onSubmit: () => void
  submitLabel: string
  error?: string
  /** 模块自己的选项区，排在通用字段之后、提交按钮之前 */
  children?: React.ReactNode
}

/**
 * 出生信息表单：姓名、性别、出生时间、出生地
 *
 * 各命理模块共用这一份，模块特有的选项通过 `children` 接在后面
 */
export function BirthForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  error,
  children,
}: BirthFormProps) {
  const patch = (part: Partial<BirthInfo>) => onChange({ ...value, ...part })
  const moment = parseMoment(value.date, value.time)
  const birthplace = birthplaceOf(value)

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">姓名</FieldLabel>
          <Input
            id="name"
            value={value.name}
            placeholder="选填"
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>

        <Field>
          <FieldLabel>性别</FieldLabel>
          <RadioGroup
            className="flex gap-6"
            value={value.gender}
            onValueChange={(v) => patch({ gender: v as Gender })}
          >
            <FieldLabel
              htmlFor="gender-male"
              className="flex items-center gap-2 font-normal"
            >
              <RadioGroupItem id="gender-male" value="male" />
              男（乾造）
            </FieldLabel>
            <FieldLabel
              htmlFor="gender-female"
              className="flex items-center gap-2 font-normal"
            >
              <RadioGroupItem id="gender-female" value="female" />
              女（坤造）
            </FieldLabel>
          </RadioGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="birth-time">出生时间</FieldLabel>
          <div className="flex flex-col gap-2">
            <DateTimePicker
              id="birth-time"
              date={value.date}
              time={value.time}
              onChange={(v) => patch(v)}
            />
            <FieldDescription className="m-0">
              公历，北京时间，精确到分
            </FieldDescription>
          </div>
        </Field>

        <Field>
          <FieldLabel>出生地</FieldLabel>
          <div className="flex flex-col gap-2">
            <RegionCascader
              path={value.region}
              onChange={(region) => patch({ region })}
            />
            <FieldDescription className="m-0">
              {birthplace
                ? `${locationNameOf(value)} 东经 ${birthplace.lng}`
                : "真太阳时按所选地点的经度校正，选到乡镇最准"}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>

      {children}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={!moment || !value.gender}>
          {submitLabel}
          <RiArrowRightLine />
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  )
}
