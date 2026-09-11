# 紫微斗数 第二期：服务端与解读 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 服务端支持紫微斗数：讲义切片知识库与按命盘检索、报告存储带体系字段、路由按体系分组、紫微提示词与流式解读接口。

**Architecture:** 依赖第一期的 `internal/birth`、`internal/ziwei`。新增 `internal/ziwei/knowledge`（知识库类型、加载与检索）与 `tools/ziweikb`（一次性抽取工具，`go run`，依赖 poppler 的 `pdftotext` 与 `pdfinfo`），数据落在 `data/ziwei/knowledge.json` 并由 `main.go` 内嵌。`internal/report` 的 `Report` 加 `System`，`Options` 改成原始 JSON；`internal/httpapi` 的解读流程抽成与体系无关的骨架，八字与紫微各接一个解析器与提示词。设计见 `docs/superpowers/specs/2026-09-11-ziwei-design.md` 的「服务端」「知识库」两节。

**Tech Stack:** Go 1.27 标准库、bbolt、tyme4go；poppler-utils（只在开发机跑抽取工具）。

## Global Constraints

- Go 风格按 `liasica-skills:go-style`；注释中文，结尾不加句号；`go vet ./...` 无 issue
- JSON key 英文；接口错误文案中文
- 讲义原文只进提示词，不进任何接口响应、日志或界面
- 提交信息 Conventional Commits，中文，不加 AI 署名，不主动推送
- 前端在本期只改一处接口地址（`/api/analyze` -> `/api/bazi/analyze`），其余前端改动留给第三期

## File Structure

```
internal/ziwei/knowledge/library.go      Library 类型、Load、完整性校验
internal/ziwei/knowledge/select.go       按命盘选条目、渲染成提示词段落
internal/ziwei/knowledge/library_test.go 合成库的选取测试
internal/ziwei/knowledge/data_test.go    对真实数据文件的完整性测试
tools/ziweikb/main.go                    抽取工具
tools/ziweikb/overrides.json             抽取时需要手工订正的原文行
data/ziwei/knowledge.json                切片数据（约 1.4 MB）
internal/report/report.go                Report 加 System，Options 改 json.RawMessage
internal/report/report_test.go           存取与旧数据兼容
internal/httpapi/input.go                共用的输入解析，八字专属的部分改名
internal/httpapi/ziwei.go                紫微的排盘接口与请求解析
internal/httpapi/analyze.go              与体系无关的解读骨架
internal/httpapi/prompt.go               共用的提示词片段
internal/httpapi/prompt_bazi.go          八字提示词（从 prompt.go 拆出）
internal/httpapi/prompt_ziwei.go         紫微提示词
internal/httpapi/router.go               按体系分组的路由
main.go                                  内嵌 data/ziwei，装载知识库
Dockerfile                               COPY data/ziwei
```

---

### Task 1: 知识库类型、加载与检索

**Files:**
- Create: `internal/ziwei/knowledge/library.go`、`internal/ziwei/knowledge/select.go`
- Test: `internal/ziwei/knowledge/library_test.go`

**Interfaces:**
- Produces：

```go
type MutationEntry struct { Star string `json:"star"`; Text string `json:"text"` }
type Library struct {
	Source    string                       `json:"source"`
	Stars     map[string]string            `json:"stars"`
	Systems   map[string]string            `json:"systems"`
	Assist    map[string]string            `json:"assist"`
	Mutations map[string]MutationEntry     `json:"mutations"`
	Adjective map[string]string            `json:"adjective"`
	Palaces   map[string]map[string]string `json:"palaces"`
}
func Load(fsys fs.FS) (*Library, error)          // 读 knowledge.json
func (l *Library) Validate() []string             // 缺失的键
type Entry struct { Title, Text string }
func (l *Library) Select(chart ziwei.Chart, limit ziwei.Limit) []Entry
func Render(entries []Entry) string
func SystemKey(chart ziwei.Chart) string          // 命宫星系名，如「太阳独坐巳亥」
const Budget = 45000                              // 选取的总字数上限
```

- [ ] **Step 1: 写测试 `internal/ziwei/knowledge/library_test.go`（先失败）**

```go
package knowledge_test

import (
	"encoding/json"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/ziwei"
	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

// 参考盘 A：命宫太阳独坐亥，田宅紫微天府，福德天机，年干庚，35 到 44 岁的大限宫干戊
func chartA(t *testing.T) (ziwei.Chart, ziwei.Limit) {
	t.Helper()
	chart, err := ziwei.Paipan(
		birth.Input{Year: 1990, Month: 5, Day: 3, Hour: 12, Minute: 30, Gender: birth.GenderMale},
		ziwei.DefaultOptions,
	)
	if err != nil {
		t.Fatalf("排盘失败：%v", err)
	}
	limit, err := ziwei.LimitAt(chart, mustTime(2026, 9, 11))
	if err != nil {
		t.Fatalf("运限失败：%v", err)
	}
	return chart, limit
}

// synthetic 一份每个键都填了短文本的合成库
func synthetic(t *testing.T) fstest.MapFS {
	t.Helper()
	lib := knowledge.Library{
		Source:    "test",
		Stars:     map[string]string{},
		Systems:   map[string]string{},
		Assist:    map[string]string{},
		Mutations: map[string]knowledge.MutationEntry{},
		Adjective: map[string]string{"天伤天使": "伤使"},
		Palaces:   map[string]map[string]string{},
	}
	for _, star := range knowledge.MajorStars {
		lib.Stars[star] = "正曜 " + star
	}
	for _, name := range knowledge.SystemNames {
		lib.Systems[name] = "星系 " + name
	}
	for _, pair := range knowledge.AssistPairs {
		lib.Assist[pair] = "辅佐 " + pair
	}
	// 化曜条目带上中州派四化表里的星名，标题里要用
	table := map[string][4]string{
		"甲": {"廉贞", "破军", "武曲", "太阳"}, "乙": {"天机", "天梁", "紫微", "太阴"},
		"丙": {"天同", "天机", "文昌", "廉贞"}, "丁": {"太阴", "天同", "天机", "巨门"},
		"戊": {"贪狼", "太阴", "太阳", "天机"}, "己": {"武曲", "贪狼", "天梁", "文曲"},
		"庚": {"太阳", "武曲", "天府", "天同"}, "辛": {"巨门", "太阳", "文曲", "文昌"},
		"壬": {"天梁", "紫微", "天府", "武曲"}, "癸": {"破军", "巨门", "太阴", "贪狼"},
	}
	for _, key := range knowledge.MutationKeys {
		runes := []rune(key)
		stars := table[string(runes[0])]
		index := strings.Index("禄权科忌", string(runes[1])) / len("禄")
		lib.Mutations[key] = knowledge.MutationEntry{Star: stars[index], Text: "化曜 " + key}
	}
	for _, palace := range knowledge.PalaceNames {
		lib.Palaces[palace] = map[string]string{}
		for _, star := range knowledge.MajorStars {
			lib.Palaces[palace][star] = "宫垣 " + palace + star
		}
	}
	raw, err := json.Marshal(lib)
	if err != nil {
		t.Fatalf("序列化失败：%v", err)
	}
	return fstest.MapFS{"knowledge.json": &fstest.MapFile{Data: raw}}
}

func TestLoadAndValidate(t *testing.T) {
	lib, err := knowledge.Load(synthetic(t))
	if err != nil {
		t.Fatalf("加载失败：%v", err)
	}
	if missing := lib.Validate(); len(missing) != 0 {
		t.Errorf("合成库不应缺键：%v", missing)
	}

	delete(lib.Systems, "紫微独坐子午")
	delete(lib.Palaces["命宫"], "天机")
	// 缺键按字母序报告，palaces 排在 systems 之前
	missing := lib.Validate()
	if len(missing) != 2 || missing[0] != "palaces.命宫.天机" || missing[1] != "systems.紫微独坐子午" {
		t.Errorf("缺键报告不符：%v", missing)
	}
}

func TestSystemKey(t *testing.T) {
	chart, _ := chartA(t)
	if got := knowledge.SystemKey(chart); got != "太阳独坐巳亥" {
		t.Errorf("命宫星系应为太阳独坐巳亥，得到 %s", got)
	}
}

func TestSelectOrderAndDedupe(t *testing.T) {
	lib, err := knowledge.Load(synthetic(t))
	if err != nil {
		t.Fatalf("加载失败：%v", err)
	}
	chart, limit := chartA(t)
	entries := lib.Select(chart, limit)
	titles := make([]string, 0, len(entries))
	for _, e := range entries {
		titles = append(titles, e.Title)
	}

	want := []string{
		"星系 太阳独坐巳亥",
		"正曜 太阳",
		"庚干四化 太阳化禄", "庚干四化 武曲化权", "庚干四化 天府化科", "庚干四化 天同化忌",
		"戊干四化 贪狼化禄", "戊干四化 太阴化权", "戊干四化 太阳化科", "戊干四化 天机化忌",
		"丙干四化 天同化禄", "丙干四化 天机化权", "丙干四化 文昌化科", "丙干四化 廉贞化忌",
		"命宫 太阳", "福德宫 天机", "夫妻宫 天同", "财帛宫 天梁", "事业宫 太阴", "疾厄宫 廉贞", "疾厄宫 天相",
		"迁移宫 巨门", "父母宫 破军", "田宅宫 紫微", "田宅宫 天府", "子女宫 七杀", "兄弟宫 武曲", "交友宫 贪狼",
		"辅佐煞 左辅右弼", "辅佐煞 天魁天钺", "辅佐煞 火星铃星", "辅佐煞 擎羊陀罗", "辅佐煞 地空地劫",
	}
	if strings.Join(titles, "|") != strings.Join(want, "|") {
		t.Errorf("选取顺序不符：\n得到 %v\n期望 %v", titles, want)
	}

	rendered := knowledge.Render(entries)
	if !strings.HasPrefix(rendered, "### 星系 太阳独坐巳亥\n星系 太阳独坐巳亥\n") {
		t.Errorf("渲染格式不符：%q", rendered[:60])
	}
}

func TestSelectBorrowsOppositeAndKeepsBudget(t *testing.T) {
	fsys := synthetic(t)
	lib, err := knowledge.Load(fsys)
	if err != nil {
		t.Fatalf("加载失败：%v", err)
	}
	// 参考盘 B 的田宅宫无正曜，借对宫卯的太阳天梁
	chart, err := ziwei.Paipan(
		birth.Input{Year: 2000, Month: 8, Day: 16, Hour: 4, Minute: 0, Gender: birth.GenderFemale},
		ziwei.DefaultOptions,
	)
	if err != nil {
		t.Fatalf("排盘失败：%v", err)
	}
	limit, err := ziwei.LimitAt(chart, mustTime(2026, 9, 11))
	if err != nil {
		t.Fatalf("运限失败：%v", err)
	}
	joined := knowledge.Render(lib.Select(chart, limit))
	if !strings.Contains(joined, "### 田宅宫 太阳\n") || !strings.Contains(joined, "### 田宅宫 天梁\n") {
		t.Error("无正曜的宫应借对宫正曜取宫垣论")
	}

	// 把每条塞到接近上限，只剩前几条能放进去
	long := strings.Repeat("字", knowledge.Budget/3)
	for k := range lib.Systems {
		lib.Systems[k] = long
	}
	for k := range lib.Stars {
		lib.Stars[k] = long
	}
	for k, v := range lib.Mutations {
		lib.Mutations[k] = knowledge.MutationEntry{Star: v.Star, Text: long}
	}
	entries := lib.Select(chart, limit)
	total := 0
	for _, e := range entries {
		total += len([]rune(e.Text))
	}
	if total > knowledge.Budget || len(entries) != 3 {
		t.Errorf("应在预算内截断：共 %d 字 %d 条", total, len(entries))
	}
}
```

文件末尾加辅助函数：

```go
func mustTime(year, month, day int) time.Time {
	return time.Date(year, time.Month(month), day, 12, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600))
}
```

（import 加 `"time"`。）

- [ ] **Step 2: 运行确认失败**

```bash
go test ./internal/ziwei/knowledge/...
```

预期：编译失败，包不存在。

- [ ] **Step 3: 写 `internal/ziwei/knowledge/library.go`**

```go
// Package knowledge 紫微斗数解读的知识库
//
// 数据是《中州派紫微斗数深造讲义》上下册按标题切成的条目，由 tools/ziweikb 抽取到
// data/ziwei/knowledge.json，随二进制内嵌。解读时按命盘挑出相关条目放进提示词，
// 原文只进提示词，不进任何接口响应
package knowledge

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
)

// fileName 数据文件名
const fileName = "knowledge.json"

// MutationEntry 一条化曜：哪颗星在此干化此曜，以及论述
type MutationEntry struct {
	Star string `json:"star"`
	Text string `json:"text"`
}

// Library 全部条目
type Library struct {
	// Source 数据来源说明
	Source string `json:"source"`
	// Stars 十四正曜，键为星名
	Stars map[string]string `json:"stars"`
	// Systems 六十星系，键如「太阳独坐巳亥」，正曜按紫微至破军的表序排列
	Systems map[string]string `json:"systems"`
	// Assist 辅佐煞的对星，键如「左辅右弼」
	Assist map[string]string `json:"assist"`
	// Mutations 四十条化曜，键为干加化，如「甲禄」
	Mutations map[string]MutationEntry `json:"mutations"`
	// Adjective 杂曜与十二神，键为星名或对星名，如「天刑天姚」
	Adjective map[string]string `json:"adjective"`
	// Palaces 宫垣论，外层键为宫名、内层键为正曜名
	Palaces map[string]map[string]string `json:"palaces"`
}

// MajorStars 十四正曜的表序，与 ziwei 包一致
var MajorStars = []string{
	"紫微", "天机", "太阳", "武曲", "天同", "廉贞", "天府",
	"太阴", "贪狼", "巨门", "天相", "天梁", "七杀", "破军",
}

// PalaceNames 十二宫
var PalaceNames = []string{
	"命宫", "兄弟宫", "夫妻宫", "子女宫", "财帛宫", "疾厄宫",
	"迁移宫", "交友宫", "事业宫", "田宅宫", "福德宫", "父母宫",
}

// AssistPairs 辅佐煞的对星
var AssistPairs = []string{"天魁天钺", "左辅右弼", "文昌文曲", "禄存天马", "擎羊陀罗", "火星铃星", "地空地劫"}

// SystemNames 六十星系的规范名：正曜按表序、独坐或同坐、加宫位对
var SystemNames = []string{
	"紫微独坐子午", "破军独坐寅申", "廉贞天府坐辰戌", "太阴独坐巳亥", "贪狼独坐子午",
	"天同巨门坐丑未", "武曲天相坐寅申", "太阳天梁坐卯酉", "七杀独坐辰戌", "天机独坐巳亥",
	"紫微破军坐丑未", "天府独坐卯酉", "太阴独坐辰戌", "廉贞贪狼坐巳亥", "巨门独坐子午",
	"天相独坐丑未", "天同天梁坐寅申", "武曲七杀坐卯酉", "太阳独坐辰戌", "天机独坐子午",
	"紫微天府坐寅申", "太阴独坐卯酉", "贪狼独坐辰戌", "巨门独坐巳亥", "廉贞天相坐子午",
	"天梁独坐丑未", "七杀独坐寅申", "天同独坐卯酉", "武曲独坐辰戌", "太阳独坐巳亥",
	"破军独坐子午", "天机独坐丑未", "紫微贪狼坐卯酉", "巨门独坐辰戌", "天相独坐巳亥",
	"天梁独坐子午", "廉贞七杀坐丑未", "天同独坐辰戌", "武曲破军坐巳亥", "太阳独坐子午",
	"天府独坐丑未", "天机太阴坐寅申", "紫微天相坐辰戌", "天梁独坐巳亥", "七杀独坐子午",
	"廉贞独坐寅申", "破军独坐辰戌", "天同独坐巳亥", "武曲天府坐子午", "太阳太阴坐丑未",
	"贪狼独坐寅申", "天机巨门坐卯酉", "紫微七杀坐巳亥", "廉贞破军坐卯酉", "天府独坐巳亥",
	"天同太阴坐子午", "武曲贪狼坐丑未", "太阳巨门坐寅申", "天相独坐卯酉", "天机天梁坐辰戌",
}

// MutationKeys 四十条化曜的键
var MutationKeys = func() []string {
	keys := make([]string, 0, 40)
	for _, stem := range []string{"甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"} {
		for _, mutation := range []string{"禄", "权", "科", "忌"} {
			keys = append(keys, stem+mutation)
		}
	}
	return keys
}()

// Load 从文件系统读入 knowledge.json
func Load(fsys fs.FS) (*Library, error) {
	raw, err := fs.ReadFile(fsys, fileName)
	if err != nil {
		return nil, fmt.Errorf("读取知识库失败：%w", err)
	}

	var lib Library
	if err = json.Unmarshal(raw, &lib); err != nil {
		return nil, fmt.Errorf("解析知识库失败：%w", err)
	}
	return &lib, nil
}

// Validate 列出缺失的键：十四正曜、六十星系、七对辅佐煞、四十条化曜、十二宫各十四正曜
func (l *Library) Validate() []string {
	var missing []string
	for _, star := range MajorStars {
		if l.Stars[star] == "" {
			missing = append(missing, "stars."+star)
		}
	}
	for _, name := range SystemNames {
		if l.Systems[name] == "" {
			missing = append(missing, "systems."+name)
		}
	}
	for _, pair := range AssistPairs {
		if l.Assist[pair] == "" {
			missing = append(missing, "assist."+pair)
		}
	}
	for _, key := range MutationKeys {
		if l.Mutations[key].Text == "" {
			missing = append(missing, "mutations."+key)
		}
	}
	for _, palace := range PalaceNames {
		for _, star := range MajorStars {
			if l.Palaces[palace][star] == "" {
				missing = append(missing, "palaces."+palace+"."+star)
			}
		}
	}
	sort.Strings(missing)
	return missing
}
```

- [ ] **Step 4: 写 `internal/ziwei/knowledge/select.go`**

```go
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

var branchOrder = "子丑寅卯辰巳午未申酉戌亥"

func palaceByName(chart ziwei.Chart, name string) ziwei.Palace {
	for _, p := range chart.Palaces {
		if p.Name == name {
			return p
		}
	}
	return ziwei.Palace{}
}

// majorsOf 某宫的正曜名，无正曜时借对宫
func majorsOf(chart ziwei.Chart, palace ziwei.Palace) []string {
	stars := palace.MajorStars
	if len(stars) == 0 {
		index := strings.Index(branchOrder, palace.Branch) / len("子")
		stars = chart.Palaces[(index+6)%12].MajorStars
	}
	names := make([]string, 0, len(stars))
	for _, s := range stars {
		names = append(names, s.Name)
	}
	return names
}

// SystemKey 命宫星系的规范名：正曜按表序连写，一颗为「独坐」、两颗为「坐」，加命宫所在的宫位对
func SystemKey(chart ziwei.Chart) string {
	life := palaceByName(chart, "命宫")
	names := majorsOf(chart, life)
	pair := branchPairs[(strings.Index(branchOrder, life.Branch)/len("子"))%6]
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

	systemKey := SystemKey(chart)
	add("星系 "+systemKey, l.Systems[systemKey])

	life := palaceByName(chart, "命宫")
	for _, star := range majorsOf(chart, life) {
		add("正曜 "+star, l.Stars[star])
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
		palace := palaceByName(chart, name)
		for _, star := range majorsOf(chart, palace) {
			add(name+" "+star, l.Palaces[name][star])
		}
	}

	// 命宫三方四正：命宫、财帛宫、事业宫、迁移宫
	pairSeen := map[string]bool{}
	for _, name := range []string{"命宫", "财帛宫", "事业宫", "迁移宫"} {
		for _, star := range palaceByName(chart, name).MinorStars {
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
```

- [ ] **Step 5: 运行测试**

```bash
go test ./internal/ziwei/knowledge/...
```

预期：PASS。若 `TestSelectOrderAndDedupe` 的顺序不符，对照参考盘 A 的十二宫（第一期计划 Task 7 的期望值）核对 `palacePriority` 与借星逻辑。

- [ ] **Step 6: 提交**

```bash
git add internal/ziwei/knowledge
git commit -m "feat(knowledge): 紫微解读知识库的类型、加载与按命盘检索"
```

---

### Task 2: 讲义抽取工具与数据文件

**Files:**
- Create: `tools/ziweikb/main.go`、`tools/ziweikb/overrides.json`、`data/ziwei/knowledge.json`
- Test: `internal/ziwei/knowledge/data_test.go`

**Interfaces:**
- 用法：`go run ./tools/ziweikb -upper "docs/中州派-紫微斗数深造讲义(上册).pdf" -lower "docs/中州派-紫微斗数深造讲义(下册).pdf" -out data/ziwei/knowledge.json`
- 产出 `Library` 的 JSON；工具最后打印各类条目数与缺失键，有缺失时退出码 1

抽取工具是一次性的，思路是：每页按左右半页各抽一次文本保证阅读顺序；去页眉与页码；规范用字；按标题切成条目；标题识别不到的少数行放在 `overrides.json` 里手工订正。这一步免不了对着报告反复调整，验收标准是 `knowledge.Validate()` 为空。

- [ ] **Step 1: 写完整性测试 `internal/ziwei/knowledge/data_test.go`（先失败）**

```go
package knowledge_test

import (
	"os"
	"testing"

	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

// 真实数据文件必须齐全：十四正曜、六十星系、七对辅佐煞、四十条化曜、十二宫各十四正曜
func TestRealDataComplete(t *testing.T) {
	lib, err := knowledge.Load(os.DirFS("../../../data/ziwei"))
	if err != nil {
		t.Fatalf("加载失败，先跑 go run ./tools/ziweikb 生成数据：%v", err)
	}
	if missing := lib.Validate(); len(missing) != 0 {
		t.Errorf("知识库缺 %d 个键：%v", len(missing), missing)
	}
	for _, key := range []string{"天伤天使", "天刑天姚", "天哭天虚", "红鸾天喜", "三台八座", "龙池凤阁", "孤辰寡宿", "恩光天贵", "天才", "天寿", "台辅封诰", "天官天福", "蜚廉", "破碎", "阴煞", "华盖", "咸池", "解神", "天巫", "天月", "大耗", "天空", "截空旬空", "天德月德", "龙德", "天厨", "长生十二神", "博士十二神", "将前十二神", "岁前十二神"} {
		if lib.Adjective[key] == "" {
			t.Errorf("杂曜缺 %s", key)
		}
	}
	// 抽取质量的粗检：正文里不该再有页眉与竖排页码，繁体「宮」应已换成「宫」
	for key, text := range lib.Systems {
		for _, bad := range []string{"中州派紫薇斗数深造讲义", "宮"} {
			if contains(text, bad) {
				t.Errorf("星系 %s 的正文残留 %q", key, bad)
			}
		}
		if len([]rune(text)) < 300 {
			t.Errorf("星系 %s 的正文只有 %d 字，疑似切错", key, len([]rune(text)))
		}
	}
}

func contains(text, sub string) bool {
	return len(sub) > 0 && len(text) >= len(sub) && indexOf(text, sub) >= 0
}

func indexOf(text, sub string) int {
	for i := 0; i+len(sub) <= len(text); i++ {
		if text[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
```

（`contains` 用 `strings.Contains` 即可，上面只是避免 import 冲突时的写法；实现时直接 `import "strings"` 并用 `strings.Contains`，删掉两个辅助函数。）

- [ ] **Step 2: 运行确认失败**

```bash
go test ./internal/ziwei/knowledge/ -run TestRealDataComplete
```

预期：FAIL，读不到 `data/ziwei/knowledge.json`。

- [ ] **Step 3: 写 `tools/ziweikb/main.go`**

```go
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
	// systemHeading 「21 紫微天府坐寅申」，编号可缺、可带点
	systemHeading = regexp.MustCompile(`^(?:\d{1,2}[.．\s]*)?([\p{Han}]{2,4}(?:独坐|坐)[子丑寅卯辰巳午未申酉戌亥]{2})\s*\d{0,2}$`)
	groupHeading  = regexp.MustCompile(`^第[一二三四五六]组`)
	// pairHeading 「1 天魁 天钺」「2 火星 铃星」
	pairHeading = regexp.MustCompile(`^\d\s*([\p{Han}]{2})\s*([\p{Han}]{2})$`)
	// mutationHeading 「廉贞(甲干化禄)」，OCR 常把己写成巳、干写成千
	mutationHeading = regexp.MustCompile(`^([\p{Han}]{2})\(([甲乙丙丁戊己巳庚辛壬癸])[干千]化([禄权科忌])\)$`)
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
		"宮", "宫", "曰", "日", "铖", "钺", "一一", "——", "　", "", "\f", "",
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
				if stem == "巳" {
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
func fillLower(lib *knowledge.Library, lines []string) {
	chapter := ""
	var current *section
	var sections []*section
	for i, line := range lines {
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
		// 章首「1」与「紫微」分在两行时，星名单独成行
		if isStarName(line) && (current == nil || (i > 0 && pageNoPattern.MatchString(lines[i-1]))) {
			current = &section{kind: "palace", key: chapter, star: line}
			sections = append(sections, current)
			continue
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

func isStarName(line string) bool {
	return regexp.MustCompile(`^(` + starAlternatives + `)$`).MatchString(line)
}

// report 打印各类条目数与缺失的键
func report(lib *knowledge.Library) {
	_, _ = fmt.Fprintf(os.Stdout, "正曜 %d 星系 %d 辅佐煞 %d 化曜 %d 杂曜 %d 宫垣 %d 宫\n",
		len(lib.Stars), len(lib.Systems), len(lib.Assist), len(lib.Mutations), len(lib.Adjective), len(lib.Palaces))
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
```

注意：页码行在 `extract` 里已被丢掉，`fillLower` 里对 `lines[i-1]` 的页码判断因此永远不成立；把「星名单独成行」的判定改为只看 `current == nil || len(current.lines) > 40`（上一节已有正文才允许开新节），或者干脆靠订正表把「紫微」改成「1 紫微」。实现时二选一并保持测试通过。

- [ ] **Step 4: 写初版 `tools/ziweikb/overrides.json`**

已知需要订正的原文行（键是规范用字之后的整行）：

```json
{
  "紫微在丑未": "11 紫微破军坐丑未",
  "22 太阳独坐卯酉": "22 太阴独坐卯酉",
  "50 太阴太阳坐丑未": "50 太阳太阴坐丑未",
  "紫微天相坐辰戌": "43 紫微天相坐辰戌",
  "天机独坐子午 20": "20 天机独坐子午",
  "17. 天同天梁坐寅申": "17 天同天梁坐寅申",
  "18.武曲七杀坐卯酉": "18 武曲七杀坐卯酉",
  "化主 干皿": "华盖",
  "天宫 天福": "天官 天福",
  "1 化 禄": "1 化禄",
  "2 化 权": "2 化权",
  "3 化 科": "3 化科",
  "4 化 忌": "4 化忌"
}
```

- [ ] **Step 5: 跑工具，对着报告补订正表直到齐全**

```bash
mkdir -p data/ziwei
go run ./tools/ziweikb
```

按报告处理缺失：

- 星系缺某条：`grep -n` 抽取文本里该星系名附近的行，找出标题的实际写法，加进订正表
- 下册某宫缺某正曜：该章的小节标题多半是 OCR 把数字拆开或粘了标点（如「1 0 巨门」「4．武曲」），正则已放宽；仍缺的把原文行加进订正表映射成「N 星名」
- 杂曜缺某条：标题行可能带了页码或残字，加订正

调试时可把 `extract` 的结果写到 `.superpowers/ziweikb-upper.txt`、`.superpowers/ziweikb-lower.txt`（该目录不入库）方便 `grep`。重复到输出「全部齐全」为止。

- [ ] **Step 6: 完整性测试通过**

```bash
go test ./internal/ziwei/knowledge/...
```

预期：PASS。另抽查几条内容：`jq -r '.systems["太阳独坐巳亥"]' data/ziwei/knowledge.json | head -c 600` 应是巳亥宫太阳独坐的论述，开头不带上一节的尾巴；`jq -r '.palaces["夫妻宫"]["天同"]' … | head -c 400` 应是夫妻宫见天同的论述。发现切错就回到步骤 5。

- [ ] **Step 7: 提交**

```bash
git add tools/ziweikb data/ziwei internal/ziwei/knowledge/data_test.go
git commit -m "feat(knowledge): 讲义抽取工具与紫微解读知识库数据"
```

---

### Task 3: 报告存储加体系字段

**Files:**
- Modify: `internal/report/report.go`
- Test: `internal/report/report_test.go`

**Interfaces:**
- Produces：`report.SystemBazi = "bazi"`、`report.SystemZiwei = "ziwei"`、`Report.System string`、`Report.Input birth.Input`、`Report.Options json.RawMessage`、`(*Store).Upsert(id, system string, input birth.Input, options json.RawMessage) error`
- 旧记录没有 `system` 字段，读出时补成 `bazi`

- [ ] **Step 1: 写测试 `internal/report/report_test.go`（先失败）**

```go
package report

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/liasica/kismet/internal/birth"
)

func openTemp(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("打开失败：%v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

const reportID = "0123456789abcdef0123456789abcdef"

func TestUpsertKeepsSystemAndRawOptions(t *testing.T) {
	store := openTemp(t)
	input := birth.Input{Year: 1990, Month: 5, Day: 3, Hour: 12, Minute: 30, Gender: birth.GenderMale}
	options := json.RawMessage(`{"useTrueSolarTime":false,"useDaylightSaving":false,"lateZiAsNextDay":false,"maxAge":100}`)

	if err := store.Upsert(reportID, SystemZiwei, input, options); err != nil {
		t.Fatalf("写入失败：%v", err)
	}
	item, err := store.Get(reportID)
	if err != nil {
		t.Fatalf("读取失败：%v", err)
	}
	if item.System != SystemZiwei || string(item.Options) != string(options) || item.Input.Year != 1990 {
		t.Errorf("读回的报告不符：%+v", item)
	}

	// 再写一次只换选项，正文与分享保留
	if err = store.SaveAnalysis(reportID, "model-x", "正文"); err != nil {
		t.Fatalf("写正文失败：%v", err)
	}
	if err = store.Upsert(reportID, SystemZiwei, input, json.RawMessage(`{"maxAge":80}`)); err != nil {
		t.Fatalf("二次写入失败：%v", err)
	}
	if item, err = store.Get(reportID); err != nil {
		t.Fatalf("读取失败：%v", err)
	}
	if item.Analysis != "正文" || item.Model != "model-x" || string(item.Options) != `{"maxAge":80}` {
		t.Errorf("二次写入后不符：%+v", item)
	}
}

// 早期数据没有 system 字段，选项是八字结构，读出时按八字处理
func TestLegacyRecordDefaultsToBazi(t *testing.T) {
	store := openTemp(t)
	legacy := `{"id":"` + reportID + `","createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z",` +
		`"input":{"year":1990,"month":5,"day":3,"hour":12,"minute":30,"gender":"male"},` +
		`"options":{"useTrueSolarTime":true,"qiYunPrecision":"hour","maxAge":100},"analysis":""}`
	err := store.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketReports).Put([]byte(reportID), []byte(legacy))
	})
	if err != nil {
		t.Fatalf("写旧记录失败：%v", err)
	}

	item, err := store.Get(reportID)
	if err != nil {
		t.Fatalf("读取失败：%v", err)
	}
	if item.System != SystemBazi {
		t.Errorf("旧记录应按八字处理，得到 %q", item.System)
	}
	var options struct {
		QiYunPrecision string `json:"qiYunPrecision"`
	}
	if err = json.Unmarshal(item.Options, &options); err != nil || options.QiYunPrecision != "hour" {
		t.Errorf("旧记录的选项应原样保留：%s", item.Options)
	}

	page, err := store.List(0, 10)
	if err != nil || page.Total != 1 || page.Reports[0].System != SystemBazi {
		t.Errorf("列表里的旧记录也应补上体系：%+v %v", page, err)
	}
	if item.CreatedAt.Before(time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("创建时间被改动：%v", item.CreatedAt)
	}
}
```

- [ ] **Step 2: 运行确认失败**

```bash
go test ./internal/report/...
```

预期：编译失败，`SystemZiwei` 未定义、`Upsert` 参数不符。

- [ ] **Step 3: 改 `internal/report/report.go`**

import 里把 `"github.com/liasica/kismet/internal/bazi"` 换成 `"github.com/liasica/kismet/internal/birth"`（`encoding/json` 已引入）。`Report` 与 `Upsert` 改为：

```go
// 命理体系
const (
	SystemBazi  = "bazi"
	SystemZiwei = "ziwei"
)

// Report 一份报告：排盘输入、选项与解读正文
type Report struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	// System 命理体系，bazi 或 ziwei；早期记录没有这个字段，读出时按 bazi 补上
	System string      `json:"system"`
	Input  birth.Input `json:"input"`
	// Options 该体系的排盘选项，原样保存，由接口层按体系解析
	Options json.RawMessage `json:"options"`
	// Model 生成解读的模型名，尚未解读时为空
	Model string `json:"model,omitempty"`
	// Analysis 解读正文 Markdown，尚未解读时为空
	Analysis string `json:"analysis"`
	Share    *Share `json:"share,omitempty"`
}
```

```go
// Upsert 新建报告，或更新已有报告的体系、输入与选项；解读正文与分享设置保留
func (s *Store) Upsert(id, system string, input birth.Input, options json.RawMessage) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		var item Report
		err := readReport(tx, id, &item)
		if errors.Is(err, ErrNotFound) {
			item = Report{ID: id, CreatedAt: time.Now()}
		} else if err != nil {
			return err
		}

		item.System = system
		item.Input = input
		item.Options = options
		return writeReport(tx, &item)
	})
}
```

`readReport` 在 `json.Unmarshal` 成功后补默认体系：

```go
// readReport 在事务内读一条报告，早期记录没有体系字段，按八字补上
func readReport(tx *bolt.Tx, id string, item *Report) error {
	raw := tx.Bucket(bucketReports).Get([]byte(id))
	if raw == nil {
		return ErrNotFound
	}
	if err := json.Unmarshal(raw, item); err != nil {
		return err
	}
	if item.System == "" {
		item.System = SystemBazi
	}
	return nil
}
```

包注释第二段末尾补一句「报告带体系字段，八字与紫微的选项结构不同，存储层不解析选项」。

- [ ] **Step 4: 让调用方先能编译**

`internal/httpapi` 里两处 `s.reports.Upsert(...)`（`analyze.go` 与 `share.go` 各一处）暂时改成八字体系并把选项序列化：

```go
options, err := json.Marshal(chart.Options)
if err != nil {
	writeError(w, err)
	return
}
if err = s.reports.Upsert(cmd.ReportID, report.SystemBazi, chart.Input, options); err != nil {
```

（`analyze.go` 与 `share.go` 各一处；`share.go` 里 `validateChart` 返回的 `bazi.Options` 同样序列化后传入。）`admin.go` 与 `share.go` 里引用 `item.Options` 的地方类型改成 `json.RawMessage`（`sharedReport.Options`、`adminReport.Options`）。这些结构在 Task 4 与 Task 5 会再改。

- [ ] **Step 5: 跑测试**

```bash
go build ./... && go test ./internal/report/... ./internal/httpapi/...
```

预期：PASS。

- [ ] **Step 6: 提交**

```bash
git add internal
git commit -m "feat(report): 报告带命理体系字段，选项原样保存"
```

---

### Task 4: 路由按体系分组与紫微排盘接口

**Files:**
- Modify: `internal/httpapi/router.go`、`internal/httpapi/input.go`、`internal/httpapi/share.go`、`internal/httpapi/admin.go`、`web/app/src/lib/analysis.ts`
- Create: `internal/httpapi/ziwei.go`

**Interfaces:**
- 路由：`GET /api/bazi/options`、`POST /api/bazi/paipan`、`POST /api/bazi/analyze`、`POST /api/ziwei/paipan`、`POST /api/ziwei/analyze`（analyze 的处理器在 Task 5 接上，本 Task 先让 `/api/bazi/analyze` 指向现有的 `handleAnalyze`）
- 分享请求体 `{"system", "password", "input", "options", "analysis"}`，`system` 缺省为 `bazi`；分享响应与后台响应的 `report` 带 `system`，`options` 原样透传
- 输入解析：`birthRequest`（公共字段）、`parseBirth(req birthRequest, store) (birth.Input, error)`、`decodeOptions[T any](raw json.RawMessage) (*T, error)`、八字专属 `resolveBaziOptions`、`resolveBaziChart`、`validateBaziChart`、`checkBaziOptions`；紫微专属 `resolveZiweiOptions`、`resolveZiweiChart`、`validateZiweiChart`、`checkZiweiOptions`、`marshalOptions(value any) (json.RawMessage, error)`

- [ ] **Step 1: 改 `internal/httpapi/input.go`**

把 `paipanRequest` 拆成公共字段与原始选项，八字专属函数加 `Bazi`：

```go
// birthRequest 排盘请求里的出生信息，各体系共用
//
// 出生地可以传 RegionCode 让服务端查经纬度，也可以直接传 Longitude。
// 两者都给时以 RegionCode 为准
type birthRequest struct {
	Year   *int   `json:"year"`
	Month  *int   `json:"month"`
	Day    *int   `json:"day"`
	Hour   *int   `json:"hour"`
	Minute *int   `json:"minute"`
	Gender string `json:"gender"`

	Name     string `json:"name"`
	Location string `json:"location"`
	// RegionCode 区划代码，服务端据此查经纬度与完整地名
	RegionCode string   `json:"regionCode"`
	Longitude  *float64 `json:"longitude"`
	Latitude   *float64 `json:"latitude"`
}

// paipanRequest 排盘请求体：出生信息加该体系的选项，选项按体系再解析
type paipanRequest struct {
	birthRequest
	Options json.RawMessage `json:"options"`
}

// decodeOptions 把原始 JSON 解成某个体系的选项补丁，没给或为 null 时返回 nil
func decodeOptions[T any](raw json.RawMessage) (*T, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var patch T
	if err := json.Unmarshal(raw, &patch); err != nil {
		return nil, badRequest("options 不是合法的选项对象")
	}
	return &patch, nil
}

// marshalOptions 把合并后的选项序列化，存进报告
func marshalOptions(value any) (json.RawMessage, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return raw, nil
}
```

`checkInput(input birth.Input)`、`requireGender` 返回 `birth.Gender`（比较 `birth.GenderMale` / `birth.GenderFemale`）。原来的 `parsePaipanRequest` 拆成两半：

```go
// parseBirth 由请求字段组装排盘输入并校验，带区划代码时查经纬度与地名
func parseBirth(req birthRequest, store *region.Store) (input birth.Input, err error) {
	input = birth.Input{
		Gender:    birth.Gender(req.Gender),
		Name:      strings.TrimSpace(req.Name),
		Location:  strings.TrimSpace(req.Location),
		Longitude: req.Longitude,
		Latitude:  req.Latitude,
	}
	if input.Year, err = requireInt(req.Year, "year"); err != nil {
		return
	}
	if input.Month, err = requireInt(req.Month, "month"); err != nil {
		return
	}
	if input.Day, err = requireInt(req.Day, "day"); err != nil {
		return
	}
	if input.Hour, err = requireInt(req.Hour, "hour"); err != nil {
		return
	}
	if input.Minute, err = requireInt(req.Minute, "minute"); err != nil {
		return
	}
	if err = checkInput(input); err != nil {
		return
	}

	if code := strings.TrimSpace(req.RegionCode); code != "" {
		if !regionCodePattern.MatchString(code) {
			err = badRequest("regionCode 应为 6 位或 9 位的区划代码")
			return
		}
		found, ok := store.Find(code)
		if !ok {
			err = notFound("区划代码 %s 不存在", code)
			return
		}
		longitude := found.Lng
		latitude := found.Lat
		input.Longitude = &longitude
		input.Latitude = &latitude
		input.Location = store.FullName(code)
	}
	return
}

// parseBaziPaipanRequest 解析并校验八字排盘请求
func parseBaziPaipanRequest(
	r *http.Request,
	store *region.Store,
) (input birth.Input, options bazi.Options, err error) {
	var req paipanRequest
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}
	if input, err = parseBirth(req.birthRequest, store); err != nil {
		return
	}

	var patch *bazi.OptionsPatch
	if patch, err = decodeOptions[bazi.OptionsPatch](req.Options); err != nil {
		return
	}
	options, err = resolveBaziOptions(input, patch)
	return
}
```

原 `resolveChartOptions`、`resolveChart`、`validateChart`、`checkOptions` 分别改名为 `resolveBaziOptions`、`resolveBaziChart`、`validateBaziChart`、`checkBaziOptions`，参数与返回类型里的 `bazi.Input` 改成 `birth.Input`（两者是别名，改名只为一致）。`router.go` 里 `handleOptions` 改名 `handleBaziOptions`，`handlePaipan` 改名 `handleBaziPaipan` 并改调 `parseBaziPaipanRequest`。

- [ ] **Step 2: 写 `internal/httpapi/ziwei.go`**

```go
package httpapi

import (
	"fmt"
	"net/http"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/region"
	"github.com/liasica/kismet/internal/ziwei"
)

// 紫微斗数的排盘接口与请求解析，结构与八字的一一对应

// checkZiweiOptions 校验选项里有范围要求的那几项
func checkZiweiOptions(patch ziwei.OptionsPatch) error {
	if patch.MaxAge != nil && (*patch.MaxAge < 1 || *patch.MaxAge > 200) {
		return badRequest("options.maxAge 应在 1 到 200 之间，收到 %d", *patch.MaxAge)
	}
	return nil
}

// resolveZiweiOptions 校验选项并合并默认值，再确认真太阳时有经度可用；patch 为 nil 即全用默认值
func resolveZiweiOptions(input birth.Input, patch *ziwei.OptionsPatch) (ziwei.Options, error) {
	options := ziwei.DefaultOptions
	if patch != nil {
		if err := checkZiweiOptions(*patch); err != nil {
			return ziwei.Options{}, err
		}
		options = ziwei.ResolveOptions(*patch)
	}
	if options.UseTrueSolarTime && input.Longitude == nil {
		return ziwei.Options{}, badRequest("开启真太阳时需要提供 regionCode 或 longitude")
	}
	return options, nil
}

// resolveZiweiChart 校验排盘输入与选项并排盘
func resolveZiweiChart(input birth.Input, patch *ziwei.OptionsPatch) (ziwei.Chart, error) {
	if err := checkInput(input); err != nil {
		return ziwei.Chart{}, err
	}
	options, err := resolveZiweiOptions(input, patch)
	if err != nil {
		return ziwei.Chart{}, err
	}

	var chart ziwei.Chart
	if chart, err = ziwei.Paipan(input, options); err != nil {
		return ziwei.Chart{}, badRequest("排盘失败：%s", err.Error())
	}
	return chart, nil
}

// validateZiweiChart 校验一份要保存的排盘输入与选项，并实际排一次盘确认能算出来
func validateZiweiChart(input birth.Input, patch *ziwei.OptionsPatch) (ziwei.Options, error) {
	chart, err := resolveZiweiChart(input, patch)
	if err != nil {
		return ziwei.Options{}, err
	}
	return chart.Options, nil
}

// parseZiweiPaipanRequest 解析并校验紫微排盘请求
func parseZiweiPaipanRequest(
	r *http.Request,
	store *region.Store,
) (input birth.Input, options ziwei.Options, err error) {
	var req paipanRequest
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}
	if input, err = parseBirth(req.birthRequest, store); err != nil {
		return
	}

	var patch *ziwei.OptionsPatch
	if patch, err = decodeOptions[ziwei.OptionsPatch](req.Options); err != nil {
		return
	}
	options, err = resolveZiweiOptions(input, patch)
	return
}

// handleZiweiPaipan 紫微排盘，`?format=text` 返回文字命盘
func (s *Server) handleZiweiPaipan(w http.ResponseWriter, r *http.Request) {
	input, options, err := parseZiweiPaipanRequest(r, s.store)
	if err != nil {
		writeError(w, err)
		return
	}

	chart, err := ziwei.Paipan(input, options)
	if err != nil {
		writeError(w, badRequest("排盘失败：%s", err.Error()))
		return
	}

	if r.URL.Query().Get("format") == "text" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = fmt.Fprintln(w, ziwei.ToText(chart))
		return
	}
	writeJSON(w, http.StatusOK, chart)
}
```

- [ ] **Step 3: 改路由 `internal/httpapi/router.go`**

```go
	mux.HandleFunc("GET /api/bazi/options", s.handleBaziOptions)
	mux.HandleFunc("POST /api/bazi/paipan", s.handleBaziPaipan)
	mux.HandleFunc("POST /api/bazi/analyze", s.handleAnalyze)
	mux.HandleFunc("POST /api/ziwei/paipan", s.handleZiweiPaipan)
```

删掉 `GET /api/options`、`POST /api/paipan`、`POST /api/analyze` 三行。前端 `web/app/src/lib/analysis.ts` 里 `${API_BASE}/api/analyze` 改为 `${API_BASE}/api/bazi/analyze`。

- [ ] **Step 4: 分享与后台带体系**

`internal/httpapi/share.go`：

```go
// shareRequest 开启分享或改密码
//
// 报告尚未保存时随请求带上体系、排盘输入与选项；客户端本地有解读正文时也带上，以它为准写进报告。
// system 缺省按八字，兼容早期客户端
type shareRequest struct {
	System   string          `json:"system"`
	Password string          `json:"password"`
	Input    *birth.Input    `json:"input"`
	Options  json.RawMessage `json:"options"`
	Analysis string          `json:"analysis"`
}

// sharedReport 分享出去的报告内容，选项按体系原样透传
type sharedReport struct {
	System    string          `json:"system"`
	Input     birth.Input     `json:"input"`
	Options   json.RawMessage `json:"options"`
	Analysis  string          `json:"analysis"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}
```

`sharedOf` 把 `System: item.System` 带上。`handleCreateShare` 里保存输入的那段改为：

```go
	if req.Input != nil {
		var options json.RawMessage
		if options, err = validateForSystem(req.System, *req.Input, req.Options); err != nil {
			writeError(w, err)
			return
		}
		if err = s.reports.Upsert(id, systemOf(req.System), *req.Input, options); err != nil {
			writeError(w, err)
			return
		}
	}
```

在 `input.go` 末尾加两个按体系分发的函数（该文件因此要 import `internal/report` 与 `internal/ziwei`）：

```go
// systemOf 请求里的体系名，缺省按八字
func systemOf(system string) string {
	if system == "" {
		return report.SystemBazi
	}
	return system
}

// validateForSystem 按体系校验一份要保存的输入与选项，返回合并默认值后的选项 JSON
func validateForSystem(system string, input birth.Input, raw json.RawMessage) (json.RawMessage, error) {
	switch systemOf(system) {
	case report.SystemBazi:
		patch, err := decodeOptions[bazi.OptionsPatch](raw)
		if err != nil {
			return nil, err
		}
		var options bazi.Options
		if options, err = validateBaziChart(input, patch); err != nil {
			return nil, err
		}
		return marshalOptions(options)
	case report.SystemZiwei:
		patch, err := decodeOptions[ziwei.OptionsPatch](raw)
		if err != nil {
			return nil, err
		}
		var options ziwei.Options
		if options, err = validateZiweiChart(input, patch); err != nil {
			return nil, err
		}
		return marshalOptions(options)
	}
	return nil, badRequest(`system 应为 "bazi" 或 "ziwei"`)
}
```

`internal/httpapi/admin.go` 的两个结构加体系、选项改原样：

```go
type adminReportSummary struct {
	ID        string      `json:"id"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
	System    string      `json:"system"`
	Input     birth.Input `json:"input"`
	// Model 生成解读的模型名，尚未解读时为空
	Model string `json:"model,omitempty"`
	// AnalysisRunes 解读正文的字符数，0 即尚未解读
	AnalysisRunes int        `json:"analysisRunes"`
	Share         *shareInfo `json:"share,omitempty"`
}

// adminReport 单份报告的全部内容，选项按体系原样透传
type adminReport struct {
	adminReportSummary
	Options  json.RawMessage `json:"options"`
	Analysis string          `json:"analysis"`
}
```

`summaryOf` 加 `System: item.System`。

- [ ] **Step 5: 编译、测试、手工验证**

```bash
go vet ./... && go test ./... && pnpm -C web typecheck
```

用 `make dev-server` 起服务后：

```bash
curl -s -X POST localhost:36579/api/ziwei/paipan?format=text -H 'Content-Type: application/json' \
  -d '{"year":1990,"month":5,"day":3,"hour":12,"minute":30,"gender":"male"}' | head -12
```

预期：打出参考盘 A 的文字命盘，第 5 行是「阳男  大限顺行  命宫 亥  身宫 亥  土五局  命主 破军  身主 火星」。再试 `-d '{"year":1990,"month":5,"day":3,"hour":12,"minute":30,"gender":"male","options":{"maxAge":500}}'` 应返回 400 与「options.maxAge 应在 1 到 200 之间」。

- [ ] **Step 6: 提交**

```bash
git add internal web/app/src/lib/analysis.ts
git commit -m "feat(httpapi): 接口按体系分组，加紫微排盘接口，分享与后台带体系"
```

---

### Task 5: 解读骨架与紫微提示词

**Files:**
- Modify: `internal/httpapi/analyze.go`、`internal/httpapi/prompt.go`、`internal/httpapi/router.go`
- Create: `internal/httpapi/prompt_bazi.go`、`internal/httpapi/prompt_ziwei.go`
- Test: `internal/httpapi/prompt_ziwei_test.go`

**Interfaces:**
- Produces：`analysisPlan{reportID, system string; input birth.Input; options json.RawMessage; messages []chatMessage}`、`type analysisParser func(r *http.Request, now time.Time) (analysisPlan, error)`、`(*Server).serveAnalysis(w, r, parse analysisParser)`、`(*Server).handleBaziAnalyze`、`(*Server).handleZiweiAnalyze`
- `Server` 增加字段 `knowledge *knowledge.Library`，`NewServer` 增加同名参数（放在 `reports` 之后）
- 提示词：`baziAnalysisMessages(chart bazi.Chart, now time.Time)`（原 `analysisMessages`）、`ziweiAnalysisMessages(chart ziwei.Chart, lib *knowledge.Library, now time.Time) ([]chatMessage, error)`、共用的 `subjectLine(name string, gender birth.Gender, input birth.Input, location *birth.Location) string`

- [ ] **Step 1: 写测试 `internal/httpapi/prompt_ziwei_test.go`（先失败）**

```go
package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/ziwei"
	"github.com/liasica/kismet/internal/ziwei/knowledge"
)

func TestZiweiUserPrompt(t *testing.T) {
	chart, err := ziwei.Paipan(
		birth.Input{Year: 1990, Month: 5, Day: 3, Hour: 12, Minute: 30, Gender: birth.GenderMale, Name: "某某", Location: "北京市"},
		ziwei.DefaultOptions,
	)
	if err != nil {
		t.Fatalf("排盘失败：%v", err)
	}
	lib := &knowledge.Library{
		Systems:   map[string]string{"太阳独坐巳亥": "太阳在巳亥独坐的论述"},
		Stars:     map[string]string{},
		Assist:    map[string]string{},
		Mutations: map[string]knowledge.MutationEntry{},
		Palaces:   map[string]map[string]string{},
	}
	now := time.Date(2026, 9, 11, 10, 0, 0, 0, beijingZone)

	messages, err := ziweiAnalysisMessages(chart, lib, now)
	if err != nil {
		t.Fatalf("拼提示词失败：%v", err)
	}
	if len(messages) != 2 || messages[0].Role != "system" || messages[1].Role != "user" {
		t.Fatalf("消息结构不符：%+v", messages)
	}
	if !strings.Contains(messages[0].Content, "中州派") {
		t.Error("system 消息应点明中州派")
	}

	user := messages[1].Content
	for _, want := range []string{
		"命主：某某，男性，阳历 1990 年 5 月 3 日 12:30 出生，出生地北京市。",
		"今天是 2026 年 9 月 11 日，命主虚岁 37，当前流年 2026 年丙午（流年命宫在午），下一个流年 2027 年丁未（流年命宫在未），正行第 4 步大限戊寅（35 到 44 岁，2024 到 2033 年，大限命宫借原局田宅宫）。",
		"<命盘>\n某某  乾造  紫微斗数",
		"大限 戊寅（35 到 44 岁）：流曜：流禄巳 流羊午 流陀辰 流魁丑 流钺未 流昌申 流曲午 流马申；流四化：贪狼化禄 太阴化权 太阳化科 天机化忌",
		"流年 2026 年丙午（虚岁 37）：命宫在午，斗君酉，小限辰；流曜：流禄巳 流羊午 流陀辰 流魁亥 流钺酉 流昌申 流曲午 流马申 年解辰；流四化：天同化禄 天机化权 文昌化科 廉贞化忌",
		"流年 2027 年丁未（虚岁 38）：命宫在未",
		"</命盘>",
		"<参考资料>\n### 星系 太阳独坐巳亥\n太阳在巳亥独坐的论述\n</参考资料>",
		"## 六亲与人际",
		"2026 年丙午、2027 年丁未",
	} {
		if !strings.Contains(user, want) {
			t.Errorf("user 消息缺少：%s\n----\n%s", want, user)
		}
	}
}

func TestZiweiUserPromptMinorAndBeforeLimit(t *testing.T) {
	chart, err := ziwei.Paipan(
		birth.Input{Year: 2023, Month: 4, Day: 6, Hour: 12, Minute: 0, Gender: birth.GenderMale},
		ziwei.DefaultOptions,
	)
	if err != nil {
		t.Fatalf("排盘失败：%v", err)
	}
	lib := &knowledge.Library{Systems: map[string]string{}, Stars: map[string]string{}, Assist: map[string]string{}, Mutations: map[string]knowledge.MutationEntry{}, Palaces: map[string]map[string]string{}}

	// 2024 年 1 月 1 日在农历正月初一之前，流年仍是癸卯，虚岁 1，水二局尚未起限
	messages, err := ziweiAnalysisMessages(chart, lib, time.Date(2024, 1, 1, 10, 0, 0, 0, beijingZone))
	if err != nil {
		t.Fatalf("拼提示词失败：%v", err)
	}
	user := messages[1].Content
	for _, want := range []string{
		"命主虚岁 1，当前流年 2023 年癸卯",
		"（今天在农历正月初一之前，流年仍按上一年算）",
		"尚未起限，水二局 2 岁起限",
		"## 给父母的建议",
	} {
		if !strings.Contains(user, want) {
			t.Errorf("user 消息缺少：%s\n----\n%s", want, user)
		}
	}
	if strings.Contains(user, "<参考资料>") {
		t.Error("知识库为空时不该出现参考资料段")
	}
}
```

- [ ] **Step 2: 运行确认失败**

```bash
go test ./internal/httpapi/ -run TestZiwei
```

预期：编译失败，`ziweiAnalysisMessages` 未定义。

- [ ] **Step 3: 拆 `prompt.go`，八字部分挪到 `prompt_bazi.go`**

`internal/httpapi/prompt.go` 只留共用部分：

```go
package httpapi

import (
	"fmt"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/birth"
)

// 解读的提示词：固定的角色与批命规则放 system 消息，命主信息、今天的日期、所处的运限、
// 文字命盘与章节清单放 user 消息，固定内容在前才能命中上游的前缀缓存。
// 章节清单按虚岁分成人与未成年人两套，未成年人面向父母，不谈婚姻、财运与事业。
// 八字在 prompt_bazi.go，紫微在 prompt_ziwei.go

// beijingZone 「今天」按北京时间算，服务可能跑在 UTC 的容器里
var beijingZone = time.FixedZone("Asia/Shanghai", 8*3600)

// minorMaxAge 虚岁不超过这个数按未成年人批命
const minorMaxAge = 18

// subjectLine 「命主：张三，男性，阳历 1990 年 5 月 3 日 12:30 出生，出生地北京市。」
func subjectLine(name string, gender birth.Gender, input birth.Input, location *birth.Location) string {
	genderText := "女性"
	if gender == birth.GenderMale {
		genderText = "男性"
	}

	var b strings.Builder
	b.WriteString("命主：")
	if name != "" {
		b.WriteString(name)
		b.WriteString("，")
	}
	_, _ = fmt.Fprintf(
		&b,
		"%s，阳历 %d 年 %d 月 %d 日 %02d:%02d 出生",
		genderText, input.Year, input.Month, input.Day, input.Hour, input.Minute,
	)
	if location != nil && location.Name != "" {
		b.WriteString("，出生地")
		b.WriteString(location.Name)
	}
	b.WriteString("。")
	return b.String()
}
```

新建 `internal/httpapi/prompt_bazi.go`，把原 `prompt.go` 里的 `analysisSystemPrompt`、`adultSections`、`minorSections`、`analysisMessages`、`analysisUserPrompt`、`decadeClause` 原样搬过去并改名：`baziSystemPrompt`、`baziAdultSections`、`baziMinorSections`、`baziAnalysisMessages`、`baziUserPrompt`、`baziDecadeClause`；`baziUserPrompt` 里改调 `subjectLine(chart.Name, chart.Gender, chart.Input, chart.Location)`。文件头注释写「八字提示词：按子平法批命」。

- [ ] **Step 4: 写 `internal/httpapi/prompt_ziwei.go`**

```go
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
- 参考资料是中州派讲义的节选，论断按它的口径；资料与你的既有认知冲突时以资料为准；资料没有覆盖的组合按中州派的思路推断，不引用其他派别的口诀。面向命主的文字里不出现「参考资料」「讲义」「原文」字样，不照抄资料，用自己的话写。
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
		_, _ = fmt.Fprintf(&b, "大限 %s（%d 到 %d 岁）：%s\n", flow.SixtyCycle, limit.Decade.StartAge, limit.Decade.EndAge, ziwei.FlowText(flow))
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

// yearLine 一个流年的命宫、斗君、小限与流曜
func yearLine(year ziwei.Year) string {
	return fmt.Sprintf(
		"流年 %d 年%s（虚岁 %d）：命宫在%s，斗君%s，小限%s；%s\n",
		year.Year, year.SixtyCycle, year.Age, year.LifePalace, year.DouJun, year.MinorLimit, ziwei.FlowText(year.Flow),
	)
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
```

- [ ] **Step 5: 改 `analyze.go` 成与体系无关的骨架**

`analyzeRequest`、`analyzeCommand` 与 `handleAnalyze`、`parseAnalyzeRequest` 替换为：

```go
// analyzeRequest 解读请求体：排盘输入与该体系的选项，服务端据此排盘并拼提示词
type analyzeRequest struct {
	// ReportID 报告 id，带上时输入与解读结果存成报告；为空则只解读不保存
	ReportID string          `json:"reportId"`
	Input    *birth.Input    `json:"input"`
	Options  json.RawMessage `json:"options"`
}

// analysisPlan 解析后的解读请求：报告要存的内容与要发给模型的消息
type analysisPlan struct {
	// reportID 为空则不保存
	reportID string
	system   string
	input    birth.Input
	// options 合并默认值后的选项，原样存进报告
	options  json.RawMessage
	messages []chatMessage
}

// analysisParser 各体系把请求解析成解读计划：排盘、拼提示词
type analysisParser func(r *http.Request, now time.Time) (analysisPlan, error)

// handleBaziAnalyze 八字解读
func (s *Server) handleBaziAnalyze(w http.ResponseWriter, r *http.Request) {
	s.serveAnalysis(w, r, s.parseBaziAnalysis)
}

// handleZiweiAnalyze 紫微斗数解读
func (s *Server) handleZiweiAnalyze(w http.ResponseWriter, r *http.Request) {
	s.serveAnalysis(w, r, s.parseZiweiAnalysis)
}

// serveAnalysis 命理解读的公共流程，响应为 text/event-stream
func (s *Server) serveAnalysis(w http.ResponseWriter, r *http.Request, parse analysisParser) {
	if !s.deepSeek.Enabled() {
		writeError(w, apiError{
			status:  http.StatusServiceUnavailable,
			message: "服务端未配置解读服务，解读接口不可用",
		})
		return
	}

	plan, err := parse(r, time.Now())
	if err != nil {
		writeError(w, err)
		return
	}

	// 输入先存成报告，解读中途断开也留得下已生成的正文
	if plan.reportID != "" {
		if err = s.reports.Upsert(plan.reportID, plan.system, plan.input, plan.options); err != nil {
			writeError(w, err)
			return
		}
	}

	var resp *http.Response
	if resp, err = s.requestDeepSeek(r.Context(), plan.messages); err != nil {
		writeError(w, err)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	content := relayStream(w, resp.Body)
	if plan.reportID == "" || content == "" {
		return
	}
	if err = s.reports.SaveAnalysis(plan.reportID, s.deepSeek.Model, content); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "保存报告 %s 的解读失败 %v\n", plan.reportID, err)
	}
}

// decodeAnalyzeRequest 读请求体并校验必填项与报告 id
func decodeAnalyzeRequest(r *http.Request) (req analyzeRequest, reportID string, err error) {
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}
	if req.Input == nil {
		err = badRequest("input 缺失")
		return
	}
	if req.ReportID != "" {
		reportID, err = requireReportID(req.ReportID)
	}
	return
}

// parseBaziAnalysis 八字：排盘并按子平法拼提示词
func (s *Server) parseBaziAnalysis(r *http.Request, now time.Time) (plan analysisPlan, err error) {
	req, reportID, err := decodeAnalyzeRequest(r)
	if err != nil {
		return
	}
	patch, err := decodeOptions[bazi.OptionsPatch](req.Options)
	if err != nil {
		return
	}
	chart, err := resolveBaziChart(*req.Input, patch)
	if err != nil {
		return
	}

	plan = analysisPlan{reportID: reportID, system: report.SystemBazi, input: chart.Input}
	if plan.options, err = marshalOptions(chart.Options); err != nil {
		return
	}
	plan.messages, err = baziAnalysisMessages(chart, now)
	return
}

// parseZiweiAnalysis 紫微：排盘并按中州派拼提示词，附知识库里的相关条目
func (s *Server) parseZiweiAnalysis(r *http.Request, now time.Time) (plan analysisPlan, err error) {
	req, reportID, err := decodeAnalyzeRequest(r)
	if err != nil {
		return
	}
	patch, err := decodeOptions[ziwei.OptionsPatch](req.Options)
	if err != nil {
		return
	}
	chart, err := resolveZiweiChart(*req.Input, patch)
	if err != nil {
		return
	}

	plan = analysisPlan{reportID: reportID, system: report.SystemZiwei, input: chart.Input}
	if plan.options, err = marshalOptions(chart.Options); err != nil {
		return
	}
	plan.messages, err = ziweiAnalysisMessages(chart, s.knowledge, now)
	return
}
```

文件头的说明注释里「按请求里的排盘输入排盘、拼出提示词（见 prompt.go）」改为「各体系的解析器排盘并拼提示词（prompt_bazi.go、prompt_ziwei.go）」。`Server` 加字段与构造参数：

```go
type Server struct {
	store    *region.Store
	deepSeek DeepSeekConfig
	reports  *report.Store
	// knowledge 紫微解读的讲义切片
	knowledge *knowledge.Library
	unlocks   *unlockLimiter
	// adminPassword 后台管理的密码，为空即不开放后台
	adminPassword string
	// adminLimiter 管理密码的错误计数
	adminLimiter *unlockLimiter
	web          fs.FS
}

// NewServer 构造接口层，web 是前端构建产物的根目录，adminPassword 为空时后台接口返回 503
func NewServer(
	store *region.Store,
	deepSeek DeepSeekConfig,
	reports *report.Store,
	lib *knowledge.Library,
	adminPassword string,
	web fs.FS,
) *Server {
```

路由里 `POST /api/bazi/analyze` 指向 `s.handleBaziAnalyze`，加 `mux.HandleFunc("POST /api/ziwei/analyze", s.handleZiweiAnalyze)`。

- [ ] **Step 6: 跑测试**

```bash
go vet ./... && go test ./internal/httpapi/... ./internal/report/...
```

预期：PASS（`main.go` 此时还没传 `lib`，编译 `./...` 会报错，下一 Task 修）。若 `TestZiweiUserPrompt` 的第二段文字不符，先核对参考盘 A 的期望：虚岁 37、大限第 4 步戊寅 35 到 44 岁 2024 到 2033 年、田宅宫。

- [ ] **Step 7: 提交**

```bash
git add internal
git commit -m "feat(httpapi): 解读流程按体系分发，紫微按中州派拼提示词并附讲义切片"
```

---

### Task 6: 装配、镜像与文档

**Files:**
- Modify: `main.go`、`Dockerfile`、`AGENTS.md`

- [ ] **Step 1: `main.go` 内嵌知识库并传给接口层**

```go
//go:embed data/region
var regionData embed.FS

//go:embed data/ziwei
var ziweiData embed.FS
```

在打开报告数据文件之后加：

```go
	knowledgeFS, err := fs.Sub(ziweiData, "data/ziwei")
	if err != nil {
		fail("定位知识库失败 %v", err)
	}
	lib, err := knowledge.Load(knowledgeFS)
	if err != nil {
		fail("载入知识库失败 %v", err)
	}
	if missing := lib.Validate(); len(missing) > 0 {
		fail("知识库缺 %d 个键，先跑 go run ./tools/ziweikb", len(missing))
	}
```

`httpapi.NewServer(store, deepSeek, reports, lib, admin, webFS)`；import 加 `"github.com/liasica/kismet/internal/ziwei/knowledge"`。文件头注释加一行「紫微解读的讲义切片在 data/ziwei，随二进制内嵌」。

- [ ] **Step 2: Dockerfile**

Go 阶段 `COPY data/region ./data/region` 之后加 `COPY data/ziwei ./data/ziwei`。

- [ ] **Step 3: 全量验证**

```bash
make lint && make test && go run . &
sleep 2
curl -s -X POST localhost:36579/api/ziwei/analyze -H 'Content-Type: application/json' \
  -d '{"input":{"year":1990,"month":5,"day":3,"hour":12,"minute":30,"gender":"male"}}' | head -c 300
```

预期：未配置 `DEEPSEEK_API_KEY` 时返回 503 与「服务端未配置解读服务」；配置后返回 SSE 流，控制台先打印 `[思考]` 行再打印 `[解读] 结束`。看一眼生成的正文是否按八节出、是否引用了命盘里的星系与宫位。结束后 `kill %1`。

- [ ] **Step 4: AGENTS.md**

- 技术栈表「服务」行的说明加「紫微解读的知识库检索」
- 目录结构加 `internal/ziwei/knowledge/`（讲义切片的加载与按命盘检索）、`tools/ziweikb/`（讲义抽取工具，依赖 pdftotext）、`data/ziwei/`（讲义切片 `knowledge.json`，只进提示词）
- 「命理解读」一节改为两段：八字接口 `POST /api/bazi/analyze`（原文照搬）；紫微接口 `POST /api/ziwei/analyze`，收同样的 `{"reportId", "input", "options"}`，`options` 是紫微选项，提示词在 `internal/httpapi/prompt_ziwei.go`：system 消息放中州派批命规则（先看父母宫田宅宫、命宫福德宫合看、以星系论、分清原局大限流年、按参考资料口径、不承认宿命），user 消息放命主信息、今天、虚岁、所处大限与当前下一流年、`<命盘>` 文字命盘加大限流曜与流年流曜 `</命盘>`、`<参考资料>` 按命盘从知识库选出的讲义切片（命宫星系、命宫正曜、生年大限流年四化、十二宫宫垣论、三方四正的辅佐煞对星，总量 45000 字以内）`</参考资料>`、章节清单：成人八节 2500 到 3500 字，未成年人六节 1800 到 2500 字
- 路由表：`POST /api/bazi/paipan`、`GET /api/bazi/options`、`POST /api/ziwei/paipan`（`?format=text` 返回文字命盘）
- 「分享」一节：请求体加 `system`（缺省 `bazi`），响应的 `report` 带 `system`，`options` 按体系原样透传；报告存储 `Report` 带 `system`，旧数据缺省按八字
- 「后台管理」一节：列表项与详情带 `system`
- 「开发约定」加一条：「讲义切片只进提示词，任何接口响应、日志与界面都不输出它；`docs/*.pdf` 不入库，重新抽取用 `go run ./tools/ziweikb`」

- [ ] **Step 5: 提交**

```bash
git add main.go Dockerfile AGENTS.md
git commit -m "feat: 内嵌紫微知识库并接入解读服务，补文档"
```
