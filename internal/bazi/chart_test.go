package bazi_test

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/liasica/kismet/internal/bazi"
)

// 与 TypeScript 包 @kismet/core 的一致性测试
//
// Web 端的排盘由 TS 包直接算，本服务是另一份实现，两者必须逐字段一致。
// data/fixtures/charts.json 由 web 目录下的 `pnpm fixtures`
// 生成，里面是一批覆盖各个分支的输入连同 TS 侧算出的完整 Chart。
// 这里跑同样的输入，把结果序列化后与基准逐字段比对

// fixturePath 黄金基准相对本包的位置
const fixturePath = "../../data/fixtures/charts.json"

type fixture struct {
	// Label 用例说明，比对失败时用它定位
	Label   string            `json:"label"`
	Input   bazi.Input        `json:"input"`
	Options bazi.OptionsPatch `json:"options"`
	Chart   json.RawMessage   `json:"chart"`
}

// 浮点比较的容差，两边的 round2 结果应当完全相同，留一点余量兜住表示误差
const floatTolerance = 1e-9

// diffAny 递归比较两棵 JSON 树，返回差异描述
//
// got 是本实现的结果，want 是 TS 侧的基准
func diffAny(path string, got, want any) []string {
	switch wantValue := want.(type) {
	case map[string]any:
		gotValue, ok := got.(map[string]any)
		if !ok {
			return []string{fmt.Sprintf("%s: 类型不同，基准是对象，本实现是 %T", path, got)}
		}

		keys := make([]string, 0, len(wantValue)+len(gotValue))
		seen := make(map[string]bool, len(wantValue)+len(gotValue))
		for k := range wantValue {
			keys = append(keys, k)
			seen[k] = true
		}
		for k := range gotValue {
			if !seen[k] {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)

		var out []string
		for _, k := range keys {
			w, hasWant := wantValue[k]
			g, hasGot := gotValue[k]
			switch {
			case !hasGot:
				out = append(out, fmt.Sprintf("%s.%s: 本实现缺少该键，基准是 %v", path, k, w))
			case !hasWant:
				out = append(out, fmt.Sprintf("%s.%s: 本实现多出该键，值 %v", path, k, g))
			default:
				out = append(out, diffAny(path+"."+k, g, w)...)
			}
		}
		return out

	case []any:
		gotValue, ok := got.([]any)
		if !ok {
			return []string{fmt.Sprintf("%s: 类型不同，基准是数组，本实现是 %T", path, got)}
		}
		if len(gotValue) != len(wantValue) {
			return []string{fmt.Sprintf(
				"%s: 长度不同，基准 %d 项，本实现 %d 项",
				path, len(wantValue), len(gotValue),
			)}
		}

		var out []string
		for i := range wantValue {
			out = append(out, diffAny(fmt.Sprintf("%s[%d]", path, i), gotValue[i], wantValue[i])...)
		}
		return out

	case float64:
		gotValue, ok := got.(float64)
		if !ok {
			return []string{fmt.Sprintf("%s: 类型不同，基准是数字 %v，本实现是 %T", path, wantValue, got)}
		}
		if math.Abs(gotValue-wantValue) > floatTolerance {
			return []string{fmt.Sprintf("%s: 基准 %v，本实现 %v", path, wantValue, gotValue)}
		}
		return nil

	default:
		if got != want {
			return []string{fmt.Sprintf("%s: 基准 %#v，本实现 %#v", path, want, got)}
		}
		return nil
	}
}

func loadFixtures(t *testing.T) []fixture {
	t.Helper()

	raw, err := os.ReadFile(filepath.Clean(fixturePath))
	if err != nil {
		t.Fatalf("读取黄金基准失败，先在 web 目录跑 pnpm fixtures：%v", err)
	}

	var fixtures []fixture
	if err = json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatalf("解析黄金基准失败：%v", err)
	}
	if len(fixtures) == 0 {
		t.Fatal("黄金基准里没有用例")
	}
	return fixtures
}

func TestChartMatchesTypeScript(t *testing.T) {
	fixtures := loadFixtures(t)

	for _, f := range fixtures {
		t.Run(f.Label, func(t *testing.T) {
			chart, err := bazi.Paipan(f.Input, bazi.ResolveOptions(f.Options))
			if err != nil {
				t.Fatalf("排盘失败：%v", err)
			}

			encoded, err := json.Marshal(chart)
			if err != nil {
				t.Fatalf("序列化失败：%v", err)
			}

			var got, want any
			if err = json.Unmarshal(encoded, &got); err != nil {
				t.Fatalf("回读本实现的结果失败：%v", err)
			}
			if err = json.Unmarshal(f.Chart, &want); err != nil {
				t.Fatalf("回读基准失败：%v", err)
			}

			diffs := diffAny("chart", got, want)
			if len(diffs) == 0 {
				return
			}

			limit := len(diffs)
			if limit > 20 {
				limit = 20
			}
			for _, d := range diffs[:limit] {
				t.Error(d)
			}
			if len(diffs) > limit {
				t.Errorf("另有 %d 处差异未列出", len(diffs)-limit)
			}
		})
	}
}

// TestFixtureCoverage 基准用例数量的下限，防止基准被误删成空壳
func TestFixtureCoverage(t *testing.T) {
	fixtures := loadFixtures(t)
	if len(fixtures) < 40 {
		t.Errorf("黄金基准只有 %d 个用例，覆盖不足", len(fixtures))
	}
}
