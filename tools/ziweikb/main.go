// 讲义抽取工具：把《中州派紫微斗数深造讲义》上下册切成解读知识库
//
// 每一页按左右半页各抽一次文本以保证阅读顺序，去掉页眉与页码、规范用字，
// 再按标题切成条目写入 data/ziwei/knowledge.json。识别不到的标题在 overrides.json 里手工订正。
// 依赖 poppler 的 pdftotext 与 pdfinfo
//
//	go run ./tools/ziweikb -upper "docs/中州派-紫微斗数深造讲义(上册).pdf" -lower "docs/中州派-紫微斗数深造讲义(下册).pdf" -out data/ziwei/knowledge.json
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

var (
	headerPattern   = regexp.MustCompile(`^中州派紫[薇微]斗数深造讲义`)
	pageNoPattern   = regexp.MustCompile(`^\s*\d{1,3}\s*$`)
	pagesPattern    = regexp.MustCompile(`Pages:\s+(\d+)`)
	pageSizePattern = regexp.MustCompile(`Page size:\s+([\d.]+) x ([\d.]+) pts`)

	starAlternatives = "紫微|天机|太阳|武曲|天同|廉贞|天府|太阴|贪狼|巨门|天相|天梁|七杀|破军"
	// starHeading 「1 紫微」「1 0 巨门」「4．武曲」「8 太阴．」
	starHeading = regexp.MustCompile(`^\d\s?\d?[.．\s]*(` + starAlternatives + `)[.．]?$`)
	// starNameOnly 星名单独成行，不带编号
	starNameOnly = regexp.MustCompile(`^(` + starAlternatives + `)$`)
	// elementHeading 疾厄宫一章按疾病立论，十四正曜没有编号标题，改以「某曜属某五行」起段，
	// 十四曜依表序各出现一次，是该章仅有的换段标记，不适用于其他十一宫
	elementHeading = regexp.MustCompile(`^(` + starAlternatives + `)属`)
	// systemHeading 「21 紫微天府坐寅申」，编号可缺、可带点
	systemHeading = regexp.MustCompile(`^(?:\d{1,2}[.．\s]*)?([\p{Han}]{2,4}(?:独坐|坐)[子丑寅卯辰巳午未申酉戌亥]{2})\s*\d{0,2}$`)
	groupHeading  = regexp.MustCompile(`^第[一二三四五六]组`)
	// pairHeading 「1 天魁 天钺」「2 火星 铃星」
	pairHeading = regexp.MustCompile(`^\d\s*([\p{Han}]{2})\s*([\p{Han}]{2})$`)
	// mutationHeading 「廉贞(甲干化禄)」，OCR 常把己写成巳或已、干写成千
	mutationHeading = regexp.MustCompile(`^([\p{Han}]{2})\(([甲乙丙丁戊己巳已庚辛壬癸])[干千]化([禄权科忌])\)$`)
	chapterHeading  = regexp.MustCompile(`^(命\s*宫|兄弟宫|夫妻宫|子女宫|财帛宫|疾厄宫|迁移宫|交友宫(?:\(奴仆宫\)|\()?|事业宫(?:\(官禄宫\))?|田宅宫|福德宫|父母宫)$`)
	sentenceEnd     = regexp.MustCompile(`[。？！」』）\]]$`)
)

// adjectiveNames 杂曜总论里会作为标题出现的名字
var adjectiveNames = map[string]bool{
	"天伤": true, "天使": true, "天刑": true, "天姚": true, "天哭": true, "天虚": true, "红鸾": true, "天喜": true,
	"三台": true, "八座": true, "龙池": true, "凤阁": true, "孤辰": true, "寡宿": true, "恩光": true, "天贵": true,
	"天才": true, "天寿": true, "台辅": true, "封诰": true, "天官": true, "天福": true, "蜚廉": true, "破碎": true,
	"阴煞": true, "华盖": true, "咸池": true, "解神": true, "天巫": true, "天月": true, "大耗": true, "天空": true,
	"截空": true, "旬空": true, "天德": true, "月德": true, "龙德": true, "天厨": true,
	"长生十二神": true, "博士十二神": true, "将前十二神": true, "岁前十二神": true,
}

// section 切出来的一段
type section struct {
	kind   string
	key    string
	star   string
	lines  []string
	ignore bool
}

func main() {
	upper := flag.String("upper", "docs/中州派-紫微斗数深造讲义(上册).pdf", "上册 PDF")
	lower := flag.String("lower", "docs/中州派-紫微斗数深造讲义(下册).pdf", "下册 PDF")
	overridesPath := flag.String("overrides", "tools/ziweikb/overrides.json", "手工订正的原文行")
	out := flag.String("out", "data/ziwei/knowledge.json", "输出文件")
	dumpDir := flag.String("dump-dir", "", "调试用：非空时把清洗后的整本行写入该目录的 ziweikb-upper.txt、ziweikb-lower.txt")
	flag.Parse()

	overrides, err := loadOverrides(*overridesPath)
	if err != nil {
		fail("读取订正表失败 %v", err)
	}

	upperLines, err := extract(*upper, overrides)
	if err != nil {
		fail("抽取上册失败 %v", err)
	}
	lowerLines, err := extract(*lower, overrides)
	if err != nil {
		fail("抽取下册失败 %v", err)
	}
	if *dumpDir != "" {
		if err = dumpLines(*dumpDir, upperLines, lowerLines); err != nil {
			fail("写调试文件失败 %v", err)
		}
	}

	lib := &knowledge.Library{
		Source:    "王亭之《中州派紫微斗数深造讲义》上下册，pdftotext 按半页抽取后按标题切分",
		Stars:     map[string]string{},
		Systems:   map[string]string{},
		Assist:    map[string]string{},
		Mutations: map[string]knowledge.MutationEntry{},
		Adjective: map[string]string{},
		Palaces:   map[string]map[string]string{},
	}
	fillUpper(lib, upperLines)
	fillLower(lib, lowerLines)

	raw, err := json.MarshalIndent(lib, "", " ")
	if err != nil {
		fail("序列化失败 %v", err)
	}
	if err = os.WriteFile(*out, raw, 0o644); err != nil {
		fail("写文件失败 %v", err)
	}

	report(lib)
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

// loadOverrides 读订正表：键是规范用字后的原文整行，值是替换后的行
func loadOverrides(path string) (map[string]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var overrides map[string]string
	if err = json.Unmarshal(raw, &overrides); err != nil {
		return nil, err
	}
	return overrides, nil
}

// dumpLines 调试用：把清洗后的整本行各写一个文件，方便 grep 定位标题的实际写法
func dumpLines(dir string, upperLines, lowerLines []string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(dir+"/ziweikb-upper.txt", []byte(strings.Join(upperLines, "\n")), 0o644); err != nil {
		return err
	}
	return os.WriteFile(dir+"/ziweikb-lower.txt", []byte(strings.Join(lowerLines, "\n")), 0o644)
}

// pdfInfo 页数与页面宽高
func pdfInfo(pdf string) (pages int, width, height float64, err error) {
	output, err := exec.Command("pdfinfo", pdf).Output()
	if err != nil {
		return
	}
	pagesMatch := pagesPattern.FindSubmatch(output)
	sizeMatch := pageSizePattern.FindSubmatch(output)
	if pagesMatch == nil || sizeMatch == nil {
		err = fmt.Errorf("pdfinfo 输出里没有页数或页面尺寸")
		return
	}
	pages, _ = strconv.Atoi(string(pagesMatch[1]))
	width, _ = strconv.ParseFloat(string(sizeMatch[1]), 64)
	height, _ = strconv.ParseFloat(string(sizeMatch[2]), 64)
	return
}

// extract 按半页抽取整本书，返回清洗过的行
func extract(pdf string, overrides map[string]string) ([]string, error) {
	pages, width, height, err := pdfInfo(pdf)
	if err != nil {
		return nil, err
	}

	half := strconv.Itoa(int(width / 2))
	heightArg := strconv.Itoa(int(height))
	var lines []string
	for page := 1; page <= pages; page++ {
		p := strconv.Itoa(page)
		for _, x := range []string{"0", half} {
			output, runErr := exec.Command(
				"pdftotext", "-f", p, "-l", p, "-x", x, "-y", "0", "-W", half, "-H", heightArg, pdf, "-",
			).Output()
			if runErr != nil {
				return nil, fmt.Errorf("第 %d 页抽取失败：%w", page, runErr)
			}
			for _, line := range strings.Split(string(output), "\n") {
				line = normalize(line)
				if line == "" || headerPattern.MatchString(line) || pageNoPattern.MatchString(line) {
					continue
				}
				if replacement, ok := overrides[line]; ok {
					line = replacement
				}
				lines = append(lines, line)
			}
		}
	}
	return lines, nil
}

// normalize 规范用字：繁体与 OCR 常见错字
func normalize(line string) string {
	replacer := strings.NewReplacer(
		"宮", "宫", "曰", "日", "铖", "钺", "一一", "——", "　", "", "\f", "", "紫徽", "紫微",
	)
	return strings.TrimSpace(replacer.Replace(line))
}

// joinLines 拼接换行：一行以句末标点结束才换段，否则直接相连
func joinLines(lines []string) string {
	var b strings.Builder
	for i, line := range lines {
		b.WriteString(line)
		if i < len(lines)-1 && sentenceEnd.MatchString(line) {
			b.WriteString("\n")
		}
	}
	return strings.TrimSpace(b.String())
}

// fillUpper 上册：十四正曜、六十星系、辅佐煞、化曜、杂曜
func fillUpper(lib *knowledge.Library, lines []string) {
	mode := ""
	var sections []*section
	current := &section{ignore: true}
	open := func(kind, key, star string) {
		current = &section{kind: kind, key: key, star: star}
		sections = append(sections, current)
	}
	discard := func() {
		current = &section{ignore: true}
	}

	for _, line := range lines {
		switch line {
		case "十四正曜":
			mode = "stars"
			discard()
			continue
		case "六十星系":
			mode = "systems"
			discard()
			continue
		case "六十星系分布歌", "六十星系后记":
			// 六十星系末条之后另有分布歌诀与后记，均为跨星系的附录，非属最后一条星系正文
			discard()
			continue
		case "辅佐八曜", "煞曜", "煞 曜":
			mode = "assist"
			discard()
			continue
		case "化曜", "化 曜":
			mode = "mutations"
			discard()
			continue
		case "杂曜总论", "流曜总论":
			mode = "adjective"
			discard()
			continue
		case "星曜庙陷":
			mode = "done"
			discard()
			continue
		}
		if mode == "done" {
			break
		}

		switch mode {
		case "stars":
			if m := starHeading.FindStringSubmatch(line); m != nil {
				open("star", m[1], "")
				continue
			}
		case "systems":
			if groupHeading.MatchString(line) {
				discard()
				continue
			}
			if m := systemHeading.FindStringSubmatch(line); m != nil {
				open("system", m[1], "")
				continue
			}
			// 第一个星系的标题并在了正文首行，如「紫微独坐子午紫微独坐子、午。……」
			if strings.HasPrefix(line, "紫微独坐子午") && len(current.lines) == 0 && current.kind != "system" {
				open("system", "紫微独坐子午", "")
				line = strings.TrimPrefix(line, "紫微独坐子午")
			}
		case "assist":
			if m := pairHeading.FindStringSubmatch(line); m != nil {
				open("assist", m[1]+m[2], "")
				continue
			}
		case "mutations":
			if m := mutationHeading.FindStringSubmatch(line); m != nil {
				stem := m[2]
				if stem == "巳" || stem == "已" {
					stem = "己"
				}
				open("mutation", stem+m[3], m[1])
				continue
			}
		case "adjective":
			if key, ok := adjectiveKey(line); ok {
				open("adjective", key, "")
				continue
			}
		}
		if !current.ignore {
			current.lines = append(current.lines, line)
		}
	}

	for _, s := range sections {
		text := joinLines(s.lines)
		switch s.kind {
		case "star":
			lib.Stars[s.key] = text
		case "system":
			lib.Systems[canonicalSystem(s.key)] = text
		case "assist":
			lib.Assist[s.key] = text
		case "mutation":
			lib.Mutations[s.key] = knowledge.MutationEntry{Star: s.star, Text: text}
		case "adjective":
			lib.Adjective[s.key] = text
		}
	}
}

// adjectiveKey 杂曜标题：一到两个已知名字，中间可有空格
func adjectiveKey(line string) (string, bool) {
	if len([]rune(line)) > 10 || strings.ContainsAny(line, "，。；：、（）") {
		return "", false
	}
	parts := strings.Fields(line)
	if len(parts) == 1 && len([]rune(line)) == 4 {
		parts = []string{string([]rune(line)[:2]), string([]rune(line)[2:])}
	}
	for _, part := range parts {
		if !adjectiveNames[part] {
			return "", false
		}
	}
	return strings.Join(parts, ""), len(parts) > 0
}

// canonicalSystem 把书中标题换成规范名：正曜按表序、独坐或同坐、加宫位对
func canonicalSystem(title string) string {
	for _, name := range knowledge.SystemNames {
		if name == title {
			return name
		}
	}
	return title
}

// fillLower 下册：十二宫各十四正曜
//
// 页码行在 extract 阶段已被丢掉，「星名单独成行」不能再靠回看上一行是否为页码来判断是否换节，
// 改为看上一节是否已经攒够正文（40 行），只有攒够了才允许把裸星名当新节的开头，
// 避免把正文里偶然出现的孤立星名（如引文里提到的星名）误判成新章节
func fillLower(lib *knowledge.Library, lines []string) {
	chapter := ""
	var current *section
	var sections []*section
	for _, line := range lines {
		if m := chapterHeading.FindStringSubmatch(line); m != nil {
			chapter = strings.NewReplacer(" ", "", "(奴仆宫)", "", "(官禄宫)", "", "(", "").Replace(m[1])
			current = nil
			continue
		}
		if chapter == "" {
			continue
		}
		if m := starHeading.FindStringSubmatch(line); m != nil {
			current = &section{kind: "palace", key: chapter, star: m[1]}
			sections = append(sections, current)
			continue
		}
		// 章首星名单独成行，且上一节已攒够正文才允许开新节
		if starNameOnly.MatchString(line) && (current == nil || len(current.lines) > 40) {
			current = &section{kind: "palace", key: chapter, star: line}
			sections = append(sections, current)
			continue
		}
		// 疾厄宫按疾病立论，没有编号标题，靠「某曜属某五行」换段，该行本身是正文首句要保留；
		// 十四曜的分述之后另有一段跨星系的疾病分类总论，不属于任何一曜，须整段弃置，
		// 否则会全数并入最后一曜（破军）的正文
		if chapter == "疾厄宫" {
			if strings.Contains(line, "列举疾病名称") {
				current = nil
				continue
			}
			if m := elementHeading.FindStringSubmatch(line); m != nil {
				current = &section{kind: "palace", key: chapter, star: m[1]}
				sections = append(sections, current)
				current.lines = append(current.lines, line)
				continue
			}
		}
		if current != nil {
			current.lines = append(current.lines, line)
		}
	}

	for _, s := range sections {
		if lib.Palaces[s.key] == nil {
			lib.Palaces[s.key] = map[string]string{}
		}
		lib.Palaces[s.key][s.star] = joinLines(s.lines)
	}
}

// report 打印各类条目数与缺失的键
func report(lib *knowledge.Library) {
	_, _ = fmt.Fprintf(
		os.Stdout,
		"正曜 %d 星系 %d 辅佐煞 %d 化曜 %d 杂曜 %d 宫垣 %d 宫\n",
		len(lib.Stars),
		len(lib.Systems),
		len(lib.Assist),
		len(lib.Mutations),
		len(lib.Adjective),
		len(lib.Palaces),
	)
	for _, palace := range knowledge.PalaceNames {
		_, _ = fmt.Fprintf(os.Stdout, "  %s %d 条\n", palace, len(lib.Palaces[palace]))
	}
	missing := lib.Validate()
	if len(missing) == 0 {
		_, _ = fmt.Fprintln(os.Stdout, "全部齐全")
		return
	}
	_, _ = fmt.Fprintf(os.Stderr, "缺 %d 个键：\n", len(missing))
	for _, key := range missing {
		_, _ = fmt.Fprintln(os.Stderr, "  "+key)
	}
	os.Exit(1)
}
