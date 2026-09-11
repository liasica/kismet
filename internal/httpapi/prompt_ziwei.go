package httpapi

import (
	"fmt"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/ziwei"
	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

// 紫微斗数提示词：按中州派批命，命盘之后附讲义切片作参考资料

// ziweiSystemPrompt 解读的角色与批命规则
const ziweiSystemPrompt = `你是执业多年的紫微斗数命理师，按中州派（王亭之所传）的方法批命。批命的顺序是：先看父母宫与田宅宫定出身与荫庇，再把命宫与福德宫合看定格局高低与物质精神的取向，据此检视值得注意的宫位，最后看大限与流年。全文用简体中文，像面对面给客人批命那样直接、具体，不客套。

规则：
- 命盘由排盘软件按中州派安星法算出，以它为准：四化、庙陷、宫干、大限起限、流曜都不要重新推算；命盘所标的四化与坊本不同处一律以命盘为准。
- 论星以星系为单位，不孤立论单星：先定该宫正曜组成的星系（无正曜的宫借对宫正曜），再看三方四正会照的正曜，再看辅佐煞化怎样加强、削弱或转化星系的本质，杂曜只作细节的佐证。
- 每条论断都要给命盘依据：哪个宫、哪组星系、庙陷如何、哪颗化曜、哪些辅佐煞会照，或哪步大限、哪个流年的流曜与原局如何冲会。给不出依据的话不写，放在谁身上都成立的话不写。
- 分清原局、大限与流年：原局定本质，大限与流年是环境与反应。推大限看大限流曜与原局的冲会，推流年看流年流曜与大限流曜的冲会，原局同名星曜除被两重流曜冲起外不必多论；同宫最重，对宫次之，三合再次之。
- 参考资料是中州派讲义的节选，论断按它的口径；资料与你的既有认知冲突时以资料为准；资料没有覆盖的组合按中州派的思路推断，不引用其他派别的口诀。面向命主的文字里禁止提及资料的存在：不写「参考资料」「讲义」「原文」「资料显示」「据载」「书中说」等字样及同类说法，也不照抄原句；论断直接给结论与命盘依据，如同自己看盘所得。
- 不承认宿命：只说某段时间会发生什么性质的事、原因在哪、可能怎样发展，并给出趋避之方。
- 夫妻宫论配偶与婚姻，兼看命宫与福德宫的桃花诸曜；父母、兄弟、子女、交友各看本宫，田宅宫兼看家运与产业。
- 大限流年只论命盘点名的那一步大限与两个流年，不推流月流日。
- 每一节先用一两句白话给出结论，再展开依据。
- 健康只说疾厄宫星系与煞忌提示的方向，不下病名，不断手术、意外与灾祸，不谈寿命生死；官非只提防范方向。
- 不写安慰话、免责声明与「仅供参考」，不堆「可能」「或许」，判断有几分把握就写几分。
- 用 Markdown 排版：二级标题按点名的章节依次出，标题下用段落与列表，重点加粗；不用表格、代码块、链接、斜体、分割线与行尾双空格换行，段落之间空一行。篇幅按点名的要求，宁短勿超。`

// ziweiAdultSections 成人的章节清单，两个 %s 依次为当前与下一个流年
const ziweiAdultSections = `请按下面的章节批命，总篇幅 2500 到 3500 字：
## 命局总论
父母宫与田宅宫看出身与荫庇，命宫与福德宫合看格局高低与物质精神的取向，命宫星系的本质与三方四正的会照，末尾用一两句话概括这个命的底色。
## 性格与才能
命宫、身宫与福德宫星系显示的性情、长处与短处，适合的发展路线，点出最该警惕的一个弱点。
## 事业与财运
事业宫、财帛宫与命宫三方，财的性质与聚散，宜守成还是创业，当进当守的时机。
## 婚姻与感情
夫妻宫星系与桃花诸曜，配偶的性质，感情的课题与相处之道，有应期就写应期。
## 六亲与人际
父母宫、兄弟宫、子女宫、交友宫与田宅宫，亲缘、助力与家运。
## 健康
疾厄宫星系与煞忌提示的方向与日常注意。
## 大限与流年
当前大限的主题；%s、%s各自在事业、财运、感情、健康上的要点，指出流曜与原局、大限冲会的关键宫位。
## 建议
具体、可执行，与前面的判断一一对应。`

// ziweiMinorSections 未成年人的章节清单，两个 %s 依次为当前与下一个流年
const ziweiMinorSections = `命主是未成年人，批命对象是其父母，不谈婚姻、财运与事业。请按下面的章节批命，总篇幅 1800 到 2500 字：
## 命局总论
父母宫与田宅宫看家庭与荫庇，命宫与福德宫合看格局与取向，末尾用一两句话概括这个孩子的底色。
## 性格与天赋
命宫、身宫与福德宫星系显示的性情、长处与短处，以及值得培养的方向。
## 健康与体质
疾厄宫星系与煞忌提示的方向与日常照护。
## 学业与培养
命宫与福德宫的文曜与科名诸曜，适合的学习方式、管教方式与容易出问题的地方。
## 大限与流年
当前所处的大限或起限前阶段的主题；%s、%s孩子的状态与父母要留意的事。
## 给父母的建议
具体、可执行，与前面的判断一一对应。`

// ziweiAnalysisMessages 由排盘结果、知识库与当前时刻拼出发给模型的消息
func ziweiAnalysisMessages(chart ziwei.Chart, lib *knowledge.Library, now time.Time) ([]chatMessage, error) {
	user, err := ziweiUserPrompt(chart, lib, now.In(beijingZone))
	if err != nil {
		return nil, err
	}
	return []chatMessage{
		{Role: "system", Content: ziweiSystemPrompt},
		{Role: "user", Content: user},
	}, nil
}

// ziweiUserPrompt 命主信息、今天所处的大限流年、文字命盘与流曜、参考资料与章节清单
func ziweiUserPrompt(chart ziwei.Chart, lib *knowledge.Library, now time.Time) (string, error) {
	limit, err := ziwei.LimitAt(chart, now)
	if err != nil {
		return "", err
	}
	next, err := ziwei.Yearly(chart, limit.LunarYear+1)
	if err != nil {
		return "", err
	}
	current := limit.Yearly
	thisYear := fmt.Sprintf("%d 年%s", current.Year, current.SixtyCycle)
	nextYear := fmt.Sprintf("%d 年%s", next.Year, next.SixtyCycle)

	var b strings.Builder
	b.WriteString(subjectLine(chart.Name, chart.Gender, chart.Input, chart.Location))
	b.WriteString("\n")
	_, _ = fmt.Fprintf(
		&b,
		"今天是 %d 年 %d 月 %d 日，命主虚岁 %d，当前流年 %s（流年命宫在%s），下一个流年 %s（流年命宫在%s）",
		now.Year(), int(now.Month()), now.Day(), limit.Age, thisYear, current.LifePalace, nextYear, next.LifePalace,
	)
	if limit.LunarYear < now.Year() {
		b.WriteString("（今天在农历正月初一之前，流年仍按上一年算）")
	}
	b.WriteString(ziweiDecadeClause(chart, limit))
	b.WriteString("。\n\n以下是排盘软件输出的命盘：\n\n<命盘>\n")
	b.WriteString(ziwei.ToText(chart))
	b.WriteString("\n\n")
	if limit.Decade != nil {
		var flow ziwei.Flow
		if flow, err = ziwei.DecadeFlow(chart, limit.Decade.Index); err != nil {
			return "", err
		}
		_, _ = fmt.Fprintf(
			&b,
			"大限 %s（%d 到 %d 岁）：十二宫：%s；%s\n",
			flow.SixtyCycle, limit.Decade.StartAge, limit.Decade.EndAge, palaceLayoutText(flow.LifePalace), ziwei.FlowText(flow),
		)
	}
	b.WriteString(yearLine(current))
	b.WriteString(yearLine(next))
	b.WriteString("</命盘>\n\n")

	if entries := lib.Select(chart, limit); len(entries) > 0 {
		b.WriteString("<参考资料>\n")
		b.WriteString(knowledge.Render(entries))
		b.WriteString("\n</参考资料>\n\n")
	}

	sections := ziweiAdultSections
	if limit.Age <= minorMaxAge {
		sections = ziweiMinorSections
	}
	_, _ = fmt.Fprintf(&b, sections, thisYear, nextYear)
	return b.String(), nil
}

// yearLine 一个流年的命宫、斗君、小限、十二宫分布与流曜
func yearLine(year ziwei.Year) string {
	return fmt.Sprintf(
		"流年 %d 年%s（虚岁 %d）：命宫在%s，斗君%s，小限%s；十二宫：%s；%s\n",
		year.Year, year.SixtyCycle, year.Age, year.LifePalace, year.DouJun, year.MinorLimit, palaceLayoutText(year.LifePalace), ziwei.FlowText(year.Flow),
	)
}

// palaceLayoutText 十二宫自命宫逆布的紧凑罗列，如「命宫午 兄弟宫巳 夫妻宫辰 …」；
// 大限、流年另立命宫时直接给出其余各宫的地支，不留给模型自己按逆布规则推算方向
func palaceLayoutText(lifePalaceBranch string) string {
	layout := ziwei.PalaceLayout(lifePalaceBranch)
	parts := make([]string, 0, len(layout))
	for _, p := range layout {
		parts = append(parts, p.Name+p.Branch)
	}
	return strings.Join(parts, " ")
}

// ziweiDecadeClause 所处的大限，起限之前改为说明起限岁数
func ziweiDecadeClause(chart ziwei.Chart, limit ziwei.Limit) string {
	if limit.Decade == nil {
		return fmt.Sprintf("，尚未起限，%s %d 岁起限", chart.Bureau.Name, chart.Bureau.Number)
	}
	for _, palace := range chart.Palaces {
		if palace.Decade.Index == limit.Decade.Index {
			return fmt.Sprintf(
				"，正行第 %d 步大限%s（%d 到 %d 岁，%d 到 %d 年，大限命宫借原局%s）",
				limit.Decade.Index+1, palace.SixtyCycle,
				limit.Decade.StartAge, limit.Decade.EndAge, limit.Decade.StartYear, limit.Decade.EndYear,
				palace.Name,
			)
		}
	}
	return ""
}
