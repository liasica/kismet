/**
 * 把 `ZiweiChart` 渲染成文字命盘
 *
 * 一宫一段、自命宫逆布，无正曜的宫注明借对宫；解读提示词里的命盘就是这段文字
 */

import { branchIndex, mod } from "./data/tables"
import type { ZiweiChart, ZiweiPalace, ZiweiStar } from "./types"

/** 一颗星的文字：名字、括号里的庙陷、化曜 */
export function ziweiStarText(star: ZiweiStar): string {
  const brightness = star.brightness ? `（${star.brightness}）` : ""
  const mutation = star.mutation ? `化${star.mutation}` : ""
  return `${star.name}${brightness}${mutation}`
}

function starsText(stars: ZiweiStar[]): string {
  return stars.length ? stars.map(ziweiStarText).join(" ") : "无"
}

/** 正曜一行，无正曜时借对宫 */
function majorText(chart: ZiweiChart, palace: ZiweiPalace): string {
  if (palace.majorStars.length > 0) return starsText(palace.majorStars)
  const opposite = chart.palaces[mod(branchIndex(palace.branch) + 6, 12)]!
  return `无，借对宫${opposite.branch}：${starsText(opposite.majorStars)}`
}

export function ziweiToText(chart: ZiweiChart): string {
  const lines: string[] = []
  const genderText = chart.gender === "male" ? "乾造" : "坤造"
  lines.push(`${chart.name ?? "未具名"}  ${genderText}  紫微斗数`)
  lines.push(`阳历：${chart.time.input}`)
  if (chart.time.standard !== chart.time.input) {
    lines.push(
      `标准时：${chart.time.standard}（夏令时回拨 ${-chart.time.daylightSavingMinutes} 分钟）`
    )
  }
  if (chart.options.useTrueSolarTime) {
    lines.push(
      `真太阳时：${chart.time.effective}` +
        `（经度差 ${chart.time.longitudeMinutes} 分，均时差 ${chart.time.equationOfTimeMinutes} 分）`
    )
  }

  const lunar = chart.lunar
  lines.push(
    `农历：${lunar.text} ${lunar.hourBranch}时  属${chart.time.zodiac}`
  )
  if (lunar.leap) {
    lines.push(
      lunar.day > 15
        ? `闰月：闰${lunar.month}月十六起按${lunar.effectiveMonth}月安星`
        : `闰月：闰${lunar.month}月十五以前按本月安星`
    )
  }
  if (chart.location?.name) {
    const lng = chart.location.longitude
    lines.push(
      `出生地：${chart.location.name}${lng === undefined ? "" : `  东经 ${lng}`}`
    )
  }
  lines.push(
    `${chart.yang ? "阳" : "阴"}${chart.gender === "male" ? "男" : "女"}  大限${chart.forward ? "顺" : "逆"}行` +
      `  命宫 ${chart.lifePalace}  身宫 ${chart.bodyPalace}  ${chart.bureau.name}` +
      `  命主 ${chart.lifeMaster}  身主 ${chart.bodyMaster}`
  )
  lines.push(
    `生年四化：${chart.mutations.map((m) => `${m.star}化${m.mutation}`).join("  ")}`
  )
  lines.push("")
  lines.push("十二宫（自命宫逆布，无正曜的宫借对宫正曜）：")

  const byIndex = [...chart.palaces].sort((a, b) => a.index - b.index)
  for (const p of byIndex) {
    lines.push(`${p.name} ${p.sixtyCycle}${p.isBodyPalace ? "  身宫" : ""}`)
    lines.push(`  正曜：${majorText(chart, p)}`)
    lines.push(`  辅佐煞：${starsText(p.minorStars)}`)
    lines.push(`  杂曜：${starsText(p.adjectiveStars)}`)
    lines.push(
      `  长生 ${p.changSheng}  博士 ${p.boShi}` +
        `  大限 ${p.decade.startAge} 到 ${p.decade.endAge} 岁（${p.decade.startYear} 到 ${p.decade.endYear} 年）` +
        `  小限 ${p.minorLimitAges.join(" ")} 岁`
    )
  }

  return lines.join("\n")
}
