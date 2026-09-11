package knowledge

import (
	"strings"

	"github.com/liasica/kismet/internal/ziwei"
)

// Budget 选取条目的总字数上限，超出后从低优先级起丢弃
const Budget = 45000

// Entry 一条选中的资料
type Entry struct {
	Title string
	Text  string
}

// palacePriority 取宫垣论的宫位顺序
var palacePriority = []string{
	"命宫", "福德宫", "夫妻宫", "财帛宫", "事业宫", "疾厄宫",
	"迁移宫", "父母宫", "田宅宫", "子女宫", "兄弟宫", "交友宫",
}

// pairOf 辅佐煞曜所属的对星
var pairOf = map[string]string{
	"天魁": "天魁天钺", "天钺": "天魁天钺", "左辅": "左辅右弼", "右弼": "左辅右弼",
	"文昌": "文昌文曲", "文曲": "文昌文曲", "禄存": "禄存天马", "天马": "禄存天马",
	"擎羊": "擎羊陀罗", "陀罗": "擎羊陀罗", "火星": "火星铃星", "铃星": "火星铃星",
	"地空": "地空地劫", "地劫": "地空地劫",
}

// branchPairs 宫位对，索引为地支 mod 6
var branchPairs = []string{"子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"}

// palaceByName 按宫名取宫，查不到返回 false
//
// 十二宫名统一来自 ziwei 包导出的 PalaceNames，正常情况下这里不该查不到；
// 仍处理一下以防两边的宫名表出现偏差，调用方应跳过而不是拿零值当数据用
func palaceByName(chart ziwei.Chart, name string) (ziwei.Palace, bool) {
	for _, p := range chart.Palaces {
		if p.Name == name {
			return p, true
		}
	}
	return ziwei.Palace{}, false
}

// majorsOf 某宫的正曜名，无正曜时借对宫
func majorsOf(chart ziwei.Chart, palace ziwei.Palace) []string {
	stars := palace.MajorStars
	if len(stars) == 0 {
		stars = chart.Palaces[(ziwei.BranchIndex(palace.Branch)+6)%12].MajorStars
	}
	names := make([]string, 0, len(stars))
	for _, s := range stars {
		names = append(names, s.Name)
	}
	return names
}

// SystemKey 命宫星系的规范名：正曜按表序连写，一颗为「独坐」、两颗为「坐」，加命宫所在的宫位对；
// 命宫查不到时返回空串
func SystemKey(chart ziwei.Chart) string {
	life, ok := palaceByName(chart, "命宫")
	if !ok {
		return ""
	}
	names := majorsOf(chart, life)
	pair := branchPairs[ziwei.BranchIndex(life.Branch)%6]
	if len(names) == 1 {
		return names[0] + "独坐" + pair
	}
	return strings.Join(names, "") + "坐" + pair
}

// Select 按命盘挑资料，优先级依次为命宫星系、命宫正曜、生年与当前大限流年的四化、
// 十二宫按重要程度取正曜的宫垣论、命宫三方四正所见辅佐煞的对星；总字数超过 Budget 后停止
func (l *Library) Select(chart ziwei.Chart, limit ziwei.Limit) []Entry {
	var candidates []Entry
	add := func(title, text string) {
		if text != "" {
			candidates = append(candidates, Entry{Title: title, Text: text})
		}
	}

	if systemKey := SystemKey(chart); systemKey != "" {
		add("星系 "+systemKey, l.Systems[systemKey])
	}

	if life, ok := palaceByName(chart, "命宫"); ok {
		for _, star := range majorsOf(chart, life) {
			add("正曜 "+star, l.Stars[star])
		}
	}

	// 生年、大限、流年三组四化，同一条只取一次
	stems := []string{chart.YearStem}
	if limit.Decade != nil {
		for _, p := range chart.Palaces {
			if p.Decade.Index == limit.Decade.Index {
				stems = append(stems, p.Stem)
			}
		}
	}
	stems = append(stems, limit.Yearly.Stem)
	seen := map[string]bool{}
	for _, stem := range stems {
		for _, mutation := range []string{"禄", "权", "科", "忌"} {
			key := stem + mutation
			if seen[key] {
				continue
			}
			seen[key] = true
			entry := l.Mutations[key]
			add(stem+"干四化 "+entry.Star+"化"+mutation, entry.Text)
		}
	}

	for _, name := range palacePriority {
		palace, ok := palaceByName(chart, name)
		if !ok {
			continue
		}
		for _, star := range majorsOf(chart, palace) {
			add(name+" "+star, l.Palaces[name][star])
		}
	}

	// 命宫三方四正：命宫、财帛宫、事业宫、迁移宫
	pairSeen := map[string]bool{}
	for _, name := range []string{"命宫", "财帛宫", "事业宫", "迁移宫"} {
		palace, ok := palaceByName(chart, name)
		if !ok {
			continue
		}
		for _, star := range palace.MinorStars {
			pair := pairOf[star.Name]
			if pair == "" || pairSeen[pair] {
				continue
			}
			pairSeen[pair] = true
			add("辅佐煞 "+pair, l.Assist[pair])
		}
	}

	var out []Entry
	total := 0
	for _, entry := range candidates {
		size := len([]rune(entry.Text))
		if total+size > Budget {
			break
		}
		total += size
		out = append(out, entry)
	}
	return out
}

// Render 拼成提示词里的资料段，每条一个三级标题
func Render(entries []Entry) string {
	var b strings.Builder
	for _, entry := range entries {
		_, _ = b.WriteString("### " + entry.Title + "\n" + entry.Text + "\n\n")
	}
	return strings.TrimRight(b.String(), "\n")
}
