package knowledge_test

import (
	"os"
	"strings"
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
			if strings.Contains(text, bad) {
				t.Errorf("星系 %s 的正文残留 %q", key, bad)
			}
		}
		if len([]rune(text)) < 300 {
			t.Errorf("星系 %s 的正文只有 %d 字，疑似切错", key, len([]rune(text)))
		}
	}
}
