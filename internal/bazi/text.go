package bazi

import (
	"fmt"
	"strings"
)

// 把 Chart 渲染成传统排盘的竖排文字表，用于肉眼对照现有排盘工具
//
// 四柱按列排、项目按行排，中文按两个字符宽度对齐。与 TS 侧的 toText 输出一致

// ToTextOptions 文本输出的取舍
type ToTextOptions struct {
	// Decades 列出大运
	Decades bool
	// Years 列出流年，100 岁会有上百行
	Years bool
	// Months 列出流月
	Months bool
	// ElementDetail 列出五行得分明细
	ElementDetail bool
}

// DefaultToTextOptions 只列大运
var DefaultToTextOptions = ToTextOptions{Decades: true}

// displayWidth 显示宽度，非 ASCII 一律按 2 列算
func displayWidth(s string) int {
	w := 0
	for _, r := range s {
		if r < 0x80 {
			w++
			continue
		}
		w += 2
	}
	return w
}

// padEnd 右侧补空格到指定显示宽度
func padEnd(s string, w int) string {
	gap := w - displayWidth(s)
	if gap <= 0 {
		return s
	}
	return s + strings.Repeat(" ", gap)
}

// textRow 行标加四柱各一格
func textRow(label string, cells []string, labelWidth, cellWidth int) string {
	var b strings.Builder
	b.WriteString(padEnd(label, labelWidth))
	for _, c := range cells {
		b.WriteString(padEnd(c, cellWidth))
	}
	return strings.TrimRight(b.String(), " ")
}

// tableRow 表格的一行
type tableRow struct {
	label string
	cells []string
}

// pillarCells 按柱取一个字段
func pillarCells(chart Chart, pick func(Pillar) string) []string {
	cells := make([]string, 0, len(PillarKinds))
	for _, kind := range PillarKinds {
		cells = append(cells, pick(PillarOf(chart.Pillars, kind)))
	}
	return cells
}

// buildTable 组出四柱主表
func buildTable(chart Chart) []tableRow {
	grouped := GroupShenShaByPillar(chart.ShenSha)

	maxHide := 0
	maxShenSha := 1
	for _, kind := range PillarKinds {
		if n := len(PillarOf(chart.Pillars, kind).HideStems); n > maxHide {
			maxHide = n
		}
		if n := len(grouped[kind]); n > maxShenSha {
			maxShenSha = n
		}
	}

	selfLabel := "元男"
	if chart.Gender == GenderFemale {
		selfLabel = "元女"
	}

	rows := []tableRow{
		{"主星", pillarCells(chart, func(p Pillar) string {
			if p.Kind == PillarDay {
				return selfLabel
			}
			return p.StemTenStar
		})},
		{"天干", pillarCells(chart, func(p Pillar) string { return p.Stem })},
		{"地支", pillarCells(chart, func(p Pillar) string { return p.Branch })},
	}

	// 藏干与副星按层次逐行展开，一柱最多三位藏干
	for i := 0; i < maxHide; i++ {
		index := i
		hideLabel := ""
		starLabel := ""
		if index == 0 {
			hideLabel = "藏干"
			starLabel = "副星"
		}
		rows = append(rows, tableRow{hideLabel, pillarCells(chart, func(p Pillar) string {
			if index >= len(p.HideStems) {
				return ""
			}
			h := p.HideStems[index]
			return h.Stem + h.Element
		})})
		rows = append(rows, tableRow{starLabel, pillarCells(chart, func(p Pillar) string {
			if index >= len(p.HideStems) {
				return ""
			}
			return p.HideStems[index].TenStar
		})})
	}

	rows = append(rows,
		tableRow{"星运", pillarCells(chart, func(p Pillar) string { return p.Terrain })},
		tableRow{"自坐", pillarCells(chart, func(p Pillar) string { return p.SelfTerrain })},
		tableRow{"空亡", pillarCells(chart, func(p Pillar) string {
			return strings.Join(p.ExtraBranches, "")
		})},
		tableRow{"纳音", pillarCells(chart, func(p Pillar) string { return p.Sound })},
	)

	for i := 0; i < maxShenSha; i++ {
		index := i
		label := ""
		if index == 0 {
			label = "神煞"
		}
		cells := make([]string, 0, len(PillarKinds))
		for _, kind := range PillarKinds {
			hits := grouped[kind]
			if index >= len(hits) {
				cells = append(cells, "")
				continue
			}
			cells = append(cells, hits[index].Name)
		}
		rows = append(rows, tableRow{label, cells})
	}

	return rows
}

// ToText 渲染竖排文字排盘
func ToText(chart Chart, options ToTextOptions) string {
	var lines []string

	genderText := "乾造"
	if chart.Gender == GenderFemale {
		genderText = "坤造"
	}
	name := chart.Name
	if name == "" {
		name = "未具名"
	}

	lines = append(lines, fmt.Sprintf("%s  %s", name, genderText))
	lines = append(lines, "阳历："+chart.Time.Input)
	if chart.Time.Standard != chart.Time.Input {
		lines = append(lines, fmt.Sprintf(
			"标准时：%s（夏令时回拨 %d 分钟）",
			chart.Time.Standard, -chart.Time.DaylightSavingMinutes,
		))
	}
	if chart.Options.UseTrueSolarTime {
		lines = append(lines, fmt.Sprintf(
			"真太阳时：%s（经度差 %v 分，均时差 %v 分）",
			chart.Time.Effective, chart.Time.LongitudeMinutes, chart.Time.EquationOfTimeMinutes,
		))
	}
	lines = append(lines, fmt.Sprintf("阴历：%s  属%s", chart.Time.Lunar, chart.Time.Zodiac))
	if chart.Location != nil && chart.Location.Name != "" {
		line := "出生地：" + chart.Location.Name
		if chart.Location.Longitude != nil {
			line += fmt.Sprintf("  东经 %v", *chart.Location.Longitude)
		}
		lines = append(lines, line)
	}
	lines = append(lines, fmt.Sprintf(
		"节气：%s %s 起，下一节 %s %s",
		chart.Time.PrevJie.Name, chart.Time.PrevJie.Time,
		chart.Time.NextJie.Name, chart.Time.NextJie.Time,
	))
	lines = append(lines, "")

	rows := buildTable(chart)

	const labelWidth = 6
	cellWidth := 10
	for _, row := range rows {
		for _, c := range row.cells {
			if w := displayWidth(c) + 2; w > cellWidth {
				cellWidth = w
			}
		}
	}

	headers := make([]string, 0, len(PillarKinds))
	for _, kind := range PillarKinds {
		headers = append(headers, PillarLabel(kind))
	}
	lines = append(lines, textRow("日期", headers, labelWidth, cellWidth))
	lines = append(lines, strings.Repeat("-", labelWidth+cellWidth*len(PillarKinds)))
	for _, row := range rows {
		lines = append(lines, textRow(row.label, row.cells, labelWidth, cellWidth))
	}
	lines = append(lines, "")

	e := chart.Elements
	lines = append(lines, fmt.Sprintf(
		"五行（%s）：木 %v  火 %v  土 %v  金 %v  水 %v  合计 %v",
		e.Strategy, e.Scores.Wood, e.Scores.Fire, e.Scores.Earth,
		e.Scores.Metal, e.Scores.Water, e.Total,
	))
	lines = append(lines, fmt.Sprintf(
		"同类 %v（比劫加印星）  异类 %v  日主%s%s %s",
		e.SupportScore, e.OpposeScore, chart.DayStem, chart.DayStemElement, e.Strength,
	))
	lines = append(lines, fmt.Sprintf(
		"月令%s%s：木%s  火%s  土%s  金%s  水%s",
		chart.Pillars.Month.Branch, chart.Pillars.Month.BranchElement,
		e.SeasonalState.Wood, e.SeasonalState.Fire, e.SeasonalState.Earth,
		e.SeasonalState.Metal, e.SeasonalState.Water,
	))
	if options.ElementDetail {
		for _, c := range e.Contributions {
			lines = append(lines, fmt.Sprintf(
				"  %s %s +%v  %s",
				padEnd(c.Source, 18), c.Element, c.Weight, c.Reason,
			))
		}
	}
	lines = append(lines, "")

	lines = append(lines, fmt.Sprintf(
		"胎元 %s  胎息 %s  命宫 %s  身宫 %s",
		chart.Extras.FetalOrigin, chart.Extras.FetalBreath,
		chart.Extras.OwnSign, chart.Extras.BodySign,
	))
	lines = append(lines, fmt.Sprintf(
		"空亡（日柱%s旬）：%s",
		chart.Pillars.Day.Ten, strings.Join(chart.EmptyBranches, ""),
	))
	lines = append(lines, "")

	direction := "顺排"
	if !chart.QiYun.Forward {
		direction = "逆排"
	}
	lines = append(lines, fmt.Sprintf("%s  %s", direction, chart.QiYun.Text))
	lines = append(lines, fmt.Sprintf(
		"起运时刻 %s  起运虚岁 %d  折算依据 %s %s",
		chart.QiYun.StartTime, chart.QiYun.StartAge,
		chart.QiYun.Term.Name, chart.QiYun.Term.Time,
	))

	if options.Decades {
		lines = append(lines, "", "大运：")
		for _, d := range chart.Decades {
			short := ShortTenStar(d.StemTenStar) + "/" + ShortTenStar(d.BranchTenStar)
			lines = append(lines, fmt.Sprintf(
				"  %s %s  %d-%d 岁  %d-%d",
				padEnd(d.SixtyCycle, 6), short,
				d.StartAge, d.EndAge, d.StartYear, d.EndYear,
			))
			if !options.Years {
				continue
			}
			for _, y := range d.Years {
				ys := ShortTenStar(y.StemTenStar) + "/" + ShortTenStar(y.BranchTenStar)
				lines = append(lines, fmt.Sprintf(
					"      %d  %d 岁  %s %s  小运 %s",
					y.Year, y.Age, y.SixtyCycle, ys, y.MinorFortune,
				))
			}
		}
	}

	if options.Months {
		lines = append(lines, "", "流月：")
		for _, m := range chart.Months {
			lines = append(lines, fmt.Sprintf(
				"  %s %s  %s",
				padEnd(m.TermName, 6), m.TermTime, m.SixtyCycle,
			))
		}
	}

	return strings.Join(lines, "\n")
}
