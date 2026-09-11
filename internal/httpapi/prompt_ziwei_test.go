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
		"大限 戊寅（35 到 44 岁）：十二宫：命宫寅 兄弟宫丑 夫妻宫子 子女宫亥 财帛宫戌 疾厄宫酉 迁移宫申 交友宫未 事业宫午 田宅宫巳 福德宫辰 父母宫卯；流曜：流禄巳 流羊午 流陀辰 流魁丑 流钺未 流昌申 流曲午 流马申；流四化：贪狼化禄 太阴化权 太阳化科 天机化忌",
		"流年 2026 年丙午（虚岁 37）：命宫在午，斗君酉，小限辰；十二宫：命宫午 兄弟宫巳 夫妻宫辰 子女宫卯 财帛宫寅 疾厄宫丑 迁移宫子 交友宫亥 事业宫戌 田宅宫酉 福德宫申 父母宫未；流曜：流禄巳 流羊午 流陀辰 流魁亥 流钺酉 流昌申 流曲午 流马申 年解辰；流四化：天同化禄 天机化权 文昌化科 廉贞化忌",
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
