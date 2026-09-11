package knowledge_test

import (
	"encoding/json"
	"strings"
	"testing"
	"testing/fstest"
	"time"

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

func mustTime(year, month, day int) time.Time {
	return time.Date(year, time.Month(month), day, 12, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600))
}
