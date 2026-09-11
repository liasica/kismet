package ziwei

import (
	"fmt"
	"sort"
	"strings"
)

// StarText 一颗星的文字：名字、括号里的庙陷、化曜
func StarText(star Star) string {
	var b strings.Builder
	b.WriteString(star.Name)
	if star.Brightness != "" {
		_, _ = fmt.Fprintf(&b, "（%s）", star.Brightness)
	}
	if star.Mutation != "" {
		_, _ = fmt.Fprintf(&b, "化%s", star.Mutation)
	}
	return b.String()
}

func starsText(stars []Star) string {
	if len(stars) == 0 {
		return "无"
	}
	parts := make([]string, 0, len(stars))
	for _, star := range stars {
		parts = append(parts, StarText(star))
	}
	return strings.Join(parts, " ")
}

// majorText 正曜一行，无正曜时借对宫
func majorText(chart Chart, palace Palace) string {
	if len(palace.MajorStars) > 0 {
		return starsText(palace.MajorStars)
	}
	opposite := chart.Palaces[mod(BranchIndex(palace.Branch)+6, 12)]
	return fmt.Sprintf("无，借对宫%s：%s", opposite.Branch, starsText(opposite.MajorStars))
}

func mutationsText(mutations []Mutation, separator string) string {
	parts := make([]string, 0, len(mutations))
	for _, m := range mutations {
		parts = append(parts, m.Star+"化"+m.Mutation)
	}
	return strings.Join(parts, separator)
}

func joinInts(values []int) string {
	parts := make([]string, 0, len(values))
	for _, v := range values {
		parts = append(parts, fmt.Sprint(v))
	}
	return strings.Join(parts, " ")
}

// ToText 文字命盘：一宫一段、自命宫逆布，无正曜的宫注明借对宫，与 TS 侧 ziweiToText 输出一致
func ToText(chart Chart) string {
	var b strings.Builder
	line := func(format string, args ...any) {
		_, _ = fmt.Fprintf(&b, format+"\n", args...)
	}

	name := chart.Name
	if name == "" {
		name = "未具名"
	}
	genderText := "坤造"
	if chart.Gender == "male" {
		genderText = "乾造"
	}
	line("%s  %s  紫微斗数", name, genderText)
	line("阳历：%s", chart.Time.Input)
	if chart.Time.Standard != chart.Time.Input {
		line("标准时：%s（夏令时回拨 %d 分钟）", chart.Time.Standard, -chart.Time.DaylightSavingMinutes)
	}
	if chart.Options.UseTrueSolarTime {
		line("真太阳时：%s（经度差 %v 分，均时差 %v 分）",
			chart.Time.Effective, chart.Time.LongitudeMinutes, chart.Time.EquationOfTimeMinutes)
	}

	lunar := chart.Lunar
	line("农历：%s %s时  属%s", lunar.Text, lunar.HourBranch, chart.Time.Zodiac)
	if lunar.Leap {
		if lunar.Day > 15 {
			line("闰月：闰%d月十六起按%d月安星", lunar.Month, lunar.EffectiveMonth)
		} else {
			line("闰月：闰%d月十五以前按本月安星", lunar.Month)
		}
	}
	if chart.Location != nil && chart.Location.Name != "" {
		lng := ""
		if chart.Location.Longitude != nil {
			lng = fmt.Sprintf("  东经 %v", *chart.Location.Longitude)
		}
		line("出生地：%s%s", chart.Location.Name, lng)
	}

	yinYang, sex, direction := "阴", "女", "逆"
	if chart.Yang {
		yinYang = "阳"
	}
	if chart.Gender == "male" {
		sex = "男"
	}
	if chart.Forward {
		direction = "顺"
	}
	line("%s%s  大限%s行  命宫 %s  身宫 %s  %s  命主 %s  身主 %s",
		yinYang, sex, direction, chart.LifePalace, chart.BodyPalace, chart.Bureau.Name, chart.LifeMaster, chart.BodyMaster)
	line("生年四化：%s", mutationsText(chart.Mutations, "  "))
	line("")
	line("十二宫（自命宫逆布，无正曜的宫借对宫正曜）：")

	palaces := make([]Palace, len(chart.Palaces))
	copy(palaces, chart.Palaces)
	sort.Slice(palaces, func(i, j int) bool { return palaces[i].Index < palaces[j].Index })
	for _, p := range palaces {
		body := ""
		if p.IsBodyPalace {
			body = "  身宫"
		}
		line("%s %s%s", p.Name, p.SixtyCycle, body)
		line("  正曜：%s", majorText(chart, p))
		line("  辅佐煞：%s", starsText(p.MinorStars))
		line("  杂曜：%s", starsText(p.AdjectiveStars))
		line("  长生 %s  博士 %s  大限 %d 到 %d 岁（%d 到 %d 年）  小限 %s 岁",
			p.ChangSheng, p.BoShi, p.Decade.StartAge, p.Decade.EndAge, p.Decade.StartYear, p.Decade.EndYear, joinInts(p.MinorLimitAges))
	}

	return strings.TrimRight(b.String(), "\n")
}

// FlowText 大限或流年的流曜一行，如「流禄巳 流羊午 …；流四化：天同化禄 …」
func FlowText(flow Flow) string {
	parts := make([]string, 0, len(flow.Stars))
	for _, star := range flow.Stars {
		parts = append(parts, star.Name+star.Branch)
	}
	return fmt.Sprintf("流曜：%s；流四化：%s", strings.Join(parts, " "), mutationsText(flow.Mutations, " "))
}
