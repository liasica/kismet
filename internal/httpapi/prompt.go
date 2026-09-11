package httpapi

import (
	"fmt"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/bazi"
)

// 解读的提示词：固定的角色与批命规则放 system 消息，命主信息、今天的日期、所处的大运流年、
// 带流年的文字命盘与章节清单放 user 消息，固定内容在前才能命中上游的前缀缓存。
// 章节清单按虚岁分成人与未成年人两套，未成年人面向父母，不谈婚姻、财运与事业

// beijingZone 「今天」按北京时间算，服务可能跑在 UTC 的容器里
var beijingZone = time.FixedZone("Asia/Shanghai", 8*3600)

// minorMaxAge 虚岁不超过这个数按未成年人批命
const minorMaxAge = 18

// analysisSystemPrompt 解读的角色与批命规则
const analysisSystemPrompt = `你是执业多年的八字命理师，按子平法批命。批命的顺序是：先看月令与日主定旺衰，再定格局与用神喜忌，然后由用神出发论性情、六亲、事业、财运、婚姻、健康，最后看大运流年与原局的作用。与用神无关的泛论不写。全文用简体中文，像面对面给客人批命那样直接、具体，不客套。

规则：
- 命盘由排盘软件算出，以它为准，不要重新推算干支、藏干、神煞、大运或流年。软件给的日主旺衰与五行得分是按权重估算的参考，你按月令、通根、透干与生克自行判定，与软件不一致时说明理由。
- 每条论断都要给依据：出自哪一柱、哪个干支或十神、哪种刑冲合会，或哪步大运、哪年流年与原局如何作用。给不出依据的话不写，放在谁身上都成立的话不写。
- 分清命局与岁运：原局固有的性情与格局用「一贯如此」的口吻，岁运引动的事落到具体年份，不把流年的起伏说成一生的定数。
- 男命以财论妻、官杀论子女；女命以官杀论夫、食伤论子女。宫位按年柱祖上父母、月柱兄弟与事业、日支配偶、时柱子女。
- 大运流年只论命盘点名的那几步，说到应期要给理由（用神忌神到位、天克地冲、伏吟反吟、合动冲开库等）。命盘没给流月，不推算流月。
- 每一节先用一两句白话给出结论，再展开依据。
- 健康只说五行偏枯与刑冲对应的脏腑方向，不下病名，不断手术、意外与灾祸，不谈寿命生死；官非只提防范方向。
- 不写安慰话、免责声明与「仅供参考」，不堆「可能」「或许」，判断有几分把握就写几分。
- 用 Markdown 排版：二级标题按点名的章节依次出，标题下用段落与列表，重点加粗；不用表格、代码块、链接、斜体、分割线与行尾双空格换行，段落之间空一行。篇幅按点名的要求，宁短勿超。`

// adultSections 成人的章节清单，两个 %s 依次为当前与下一个流年
const adultSections = `请按下面的章节批命，总篇幅 2500 到 3500 字：
## 命局总论
格局、旺衰、用神与喜忌各给依据，末尾用一两句话概括这个命的底色。
## 性格与天赋
从日主、十神配置与刑冲合会看性情、长处与短处，点出最该警惕的一个弱点。
## 事业与财运
适合的行业方向与做事方式，求财的路子与破财的口子，当进当守的时机。
## 婚姻与感情
配偶宫与配偶星的状态、婚缘早晚、相处的课题，有应期就写应期。
## 健康
五行偏枯与刑冲对应的脏腑方向与日常注意。
## 大运与流年
当前大运的主题；%s、%s各自在事业、财运、感情上的要点；这步大运里的关键年份与理由。
## 建议
具体、可执行，与前面的判断一一对应。`

// minorSections 未成年人的章节清单，两个 %s 依次为当前与下一个流年
const minorSections = `命主是未成年人，批命对象是其父母，不谈婚姻、财运与事业。请按下面的章节批命，总篇幅 1800 到 2500 字：
## 命局总论
格局、旺衰、用神与喜忌各给依据，末尾用一两句话概括这个孩子的底色。
## 性格与天赋
从日主、十神配置与刑冲合会看性情、长处与短处，以及值得培养的方向。
## 健康与体质
五行偏枯与刑冲对应的脏腑方向与日常照护。
## 学业与培养
适合的学习方式、管教方式与容易出问题的地方。
## 大运与流年
当前所处的大运或起运前阶段的主题；%s、%s孩子的状态与父母要留意的事。
## 给父母的建议
具体、可执行，与前面的判断一一对应。`

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

// analysisUserPrompt 命主信息、今天所处的大运流年、文字命盘与章节清单
func analysisUserPrompt(chart bazi.Chart, now time.Time) (string, error) {
	position, err := bazi.FortuneAt(chart, now)
	if err != nil {
		return "", err
	}
	thisYear := fmt.Sprintf("%d 年%s", position.Year, position.SixtyCycle)
	nextYear := fmt.Sprintf("%d 年%s", position.Year+1, position.NextSixtyCycle)

	var b strings.Builder
	b.WriteString(subjectLine(chart))
	b.WriteString("\n")
	_, _ = fmt.Fprintf(
		&b,
		"今天是 %d 年 %d 月 %d 日，命主虚岁 %d，当前流年 %s，下一个流年 %s",
		now.Year(), int(now.Month()), now.Day(), position.Age, thisYear, nextYear,
	)
	if position.Year < now.Year() {
		b.WriteString("（今天在立春之前，流年仍按上一年算）")
	}
	b.WriteString(decadeClause(chart, position))
	b.WriteString("。\n\n以下是排盘软件输出的命盘：\n\n<命盘>\n")
	b.WriteString(bazi.ToText(chart, bazi.ToTextOptions{Decades: true, Years: true}))
	b.WriteString("\n</命盘>\n\n")

	sections := adultSections
	if position.Age <= minorMaxAge {
		sections = minorSections
	}
	_, _ = fmt.Fprintf(&b, sections, thisYear, nextYear)
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
