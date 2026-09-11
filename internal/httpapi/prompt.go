package httpapi

import (
	"fmt"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/bazi"
)

// 解读的提示词：固定的角色与规则放 system 消息，命主信息、今天的日期、所处的大运流年
// 与带流年的文字命盘放 user 消息，固定内容在前才能命中上游的前缀缓存

// beijingZone 「今天」按北京时间算，服务可能跑在 UTC 的容器里
var beijingZone = time.FixedZone("Asia/Shanghai", 8*3600)

// analysisSystemPrompt 解读的角色与规则
const analysisSystemPrompt = `你是资深的八字命理师，按传统子平法解读，行文直接、具体、有依据，全文用简体中文。

规则：
- 命盘由排盘软件算出，以它为准，不要重新推算干支、藏干、大运或流年。软件给出的日主强弱与五行得分是按权重估算的参考值，你可以结合月令、通根、透干自行判断，判断与软件不一致时说明理由。
- 每个结论都要点出命盘里的依据（哪一柱、哪个干支、哪个十神，或哪步大运、哪年流年），不写放之四海皆准的空话，不写安慰话，不写免责声明。
- 走势只说下面点名的两个流年，按流年逐年说。命盘没给流月，不要自行推算流月。
- 健康只说五行偏枯对应的身体方向，不下具体病名，不谈寿命与生死。
- 用 Markdown 排版：三个二级标题依次为「命格优势与盲点」「这两年的事业、财富与感情」「开运与避坑建议」，标题下用段落与列表，重点可以加粗；不用表格、代码块、链接、斜体与分割线，段落之间空一行，不用行尾双空格换行。总篇幅 1500 到 2500 字。`

// analysisMessages 由排盘结果与当前时刻拼出发给模型的消息
func analysisMessages(chart bazi.Chart, now time.Time) ([]chatMessage, error) {
	user, err := analysisUserPrompt(chart, now.In(beijingZone))
	if err != nil {
		return nil, err
	}
	return []chatMessage{
		{Role: "system", Content: analysisSystemPrompt},
		{Role: "user", Content: user},
	}, nil
}

// analysisUserPrompt 命主信息、今天所处的大运流年、文字命盘与三个问题
func analysisUserPrompt(chart bazi.Chart, now time.Time) (string, error) {
	position, err := bazi.FortuneAt(chart, now)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	b.WriteString(subjectLine(chart))
	b.WriteString("\n")
	_, _ = fmt.Fprintf(
		&b,
		"今天是 %d 年 %d 月 %d 日，命主虚岁 %d，当前流年 %d 年%s，下一个流年 %d 年%s",
		now.Year(), int(now.Month()), now.Day(),
		position.Age, position.Year, position.SixtyCycle, position.Year+1, position.NextSixtyCycle,
	)
	if position.Year < now.Year() {
		b.WriteString("（今天在立春之前，流年仍按上一年算）")
	}
	b.WriteString(decadeClause(chart, position))
	b.WriteString("。\n\n以下是排盘软件输出的命盘：\n\n<命盘>\n")
	b.WriteString(bazi.ToText(chart, bazi.ToTextOptions{Decades: true, Years: true}))
	b.WriteString("\n</命盘>\n\n请解读：\n")
	b.WriteString("1. 命格里最强的优势与最致命的盲点。\n")
	_, _ = fmt.Fprintf(
		&b,
		"2. 当前与下一个流年（%d %s、%d %s）的事业、财富与感情走势。\n",
		position.Year, position.SixtyCycle, position.Year+1, position.NextSixtyCycle,
	)
	b.WriteString("3. 具体、可执行的开运与避坑建议。")
	return b.String(), nil
}

// subjectLine 「命主：张三，男性，阳历 1990 年 5 月 3 日 12:30 出生，出生地北京市。」
func subjectLine(chart bazi.Chart) string {
	gender := "女性"
	if chart.Gender == bazi.GenderMale {
		gender = "男性"
	}

	var b strings.Builder
	b.WriteString("命主：")
	if chart.Name != "" {
		b.WriteString(chart.Name)
		b.WriteString("，")
	}
	input := chart.Input
	_, _ = fmt.Fprintf(
		&b,
		"%s，阳历 %d 年 %d 月 %d 日 %02d:%02d 出生",
		gender, input.Year, input.Month, input.Day, input.Hour, input.Minute,
	)
	if chart.Location != nil && chart.Location.Name != "" {
		b.WriteString("，出生地")
		b.WriteString(chart.Location.Name)
	}
	b.WriteString("。")
	return b.String()
}

// decadeClause 所处的大运，起运之前改为说明起运时刻
func decadeClause(chart bazi.Chart, position bazi.FortunePosition) string {
	if position.Decade != nil {
		d := position.Decade
		return fmt.Sprintf(
			"，正行%s大运（%d 到 %d 岁，%d 到 %d 年）",
			d.SixtyCycle, d.StartAge, d.EndAge, d.StartYear, d.EndYear,
		)
	}
	if position.Age < chart.QiYun.StartAge {
		return fmt.Sprintf("，尚未起运，%s 起运（虚岁 %d）", chart.QiYun.StartTime, chart.QiYun.StartAge)
	}
	return ""
}
