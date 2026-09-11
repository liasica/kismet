package knowledge

import (
	"strings"

	"github.com/liasica/kismet/internal/ziwei"
)

// Budget 选取条目的总字数上限，超出后从低优先级起丢弃：某条放不下就跳过，
// 继续尝试后面优先级更低、可能更短的条目，而不是遇到第一条放不下就整段停止
//
// 这份预算与上游的上下文窗口共用同一个总量，调整前要核对三者：
//   - Select 选中的资料本身：按当前知识库实测，一次典型 Select 在 4 万到 4.3 万字之间，
//     贴着 Budget 的上限，但通常不会触发截断
//   - 提示词里除资料外还有命盘文字、系统与用户提示词的固定部分，同样占用上游的输入长度
//   - 生成时还要留出 analyzeMaxTokens（32768，思考与正文都算在内，见
//     internal/httpapi/analyze.go），这部分从上下文窗口里单独扣除
//
// 中文在上游的分词器下通常不是一字一 token，实际 token 用量比字数更高；调大 Budget、
// 接入更长的知识库条目或更换模型时，需要对照当时用的模型的上下文窗口重新核算这个总量
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

// adjectiveKeyOf 杂曜单星名到知识库条目键的映射，键多为对星名；命盘里的杂曜名是单个的
// （如「天刑」「红鸾」「截空」），这里映射到对星键（如「天刑天姚」「红鸾天喜」「截空旬空」）
// 后再查 Adjective。劫煞、年解在命盘里会出现，但知识库没有对应条目，不在此列
var adjectiveKeyOf = map[string]string{
	"天官": "天官天福", "天福": "天官天福",
	"天厨": "天厨",
	"天刑": "天刑天姚", "天姚": "天刑天姚",
	"解神": "解神",
	"天巫": "天巫",
	"天月": "天月",
	"阴煞": "阴煞",
	"台辅": "台辅封诰", "封诰": "台辅封诰",
	"天空": "天空",
	"天哭": "天哭天虚", "天虚": "天哭天虚",
	"龙池": "龙池凤阁", "凤阁": "龙池凤阁",
	"红鸾": "红鸾天喜", "天喜": "红鸾天喜",
	"孤辰": "孤辰寡宿", "寡宿": "孤辰寡宿",
	"蜚廉": "蜚廉",
	"破碎": "破碎",
	"华盖": "华盖",
	"咸池": "咸池",
	"大耗": "大耗",
	"天德": "天德月德", "月德": "天德月德",
	"天才": "天才",
	"天寿": "天寿",
	"三台": "三台八座", "八座": "三台八座",
	"恩光": "恩光天贵", "天贵": "恩光天贵",
	"截空": "截空旬空", "截空傍": "截空旬空", "旬空": "截空旬空", "旬空傍": "截空旬空",
	"天伤": "天伤天使", "天使": "天伤天使",
}

// adjectiveGeneralKeys 杂曜里的通论性条目：长生、博士、岁前、将前四组十二神不对应命盘上
// 某一颗具体的星，龙德也不对应具体星名（只出现在岁前十二神的论述里），每张盘都固定取
var adjectiveGeneralKeys = []string{"长生十二神", "博士十二神", "岁前十二神", "将前十二神", "龙德"}

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
// 十二宫按重要程度取正曜的宫垣论、命宫三方四正所见辅佐煞的对星、命宫三方四正所见杂曜；
// 总字数超过 Budget 后的丢弃规则见 Budget 的注释
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

	// 命宫三方四正：命宫、财帛宫、事业宫、迁移宫，辅佐煞与杂曜都只看这四宫
	sanFangSiZheng := make([]ziwei.Palace, 0, 4)
	for _, name := range []string{"命宫", "财帛宫", "事业宫", "迁移宫"} {
		if palace, ok := palaceByName(chart, name); ok {
			sanFangSiZheng = append(sanFangSiZheng, palace)
		}
	}

	pairSeen := map[string]bool{}
	for _, palace := range sanFangSiZheng {
		for _, star := range palace.MinorStars {
			pair := pairOf[star.Name]
			if pair == "" || pairSeen[pair] {
				continue
			}
			pairSeen[pair] = true
			add("辅佐煞 "+pair, l.Assist[pair])
		}
	}

	// 杂曜：三方四正所见的，加上不对应具体星名的通论性条目，优先级最低
	adjectiveSeen := map[string]bool{}
	for _, palace := range sanFangSiZheng {
		for _, star := range palace.AdjectiveStars {
			key := adjectiveKeyOf[star.Name]
			if key == "" || adjectiveSeen[key] {
				continue
			}
			adjectiveSeen[key] = true
			add("杂曜 "+key, l.Adjective[key])
		}
	}
	for _, key := range adjectiveGeneralKeys {
		add("杂曜 "+key, l.Adjective[key])
	}

	var out []Entry
	total := 0
	for _, entry := range candidates {
		size := len([]rune(entry.Text))
		if total+size > Budget {
			continue
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
