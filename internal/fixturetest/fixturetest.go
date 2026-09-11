// Package fixturetest 黄金基准的加载与逐字段比对，八字与紫微的一致性测试共用
//
// Web 端的排盘由 TypeScript 包直接算，Go 是另一份实现，两者必须逐字段一致。
// data/fixtures 下的 JSON 由 web 目录的 `pnpm fixtures` 生成，
// 里面是一批输入连同 TS 侧算出的完整结果；Go 测试跑同样的输入，把结果序列化后与基准递归比对
package fixturetest

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

// Fixture 一条黄金基准：输入、选项补丁与 TS 侧算出的完整结果
type Fixture[I, O any] struct {
	// Label 用例说明，比对失败时用它定位
	Label   string          `json:"label"`
	Input   I               `json:"input"`
	Options O               `json:"options"`
	Chart   json.RawMessage `json:"chart"`
}

// floatTolerance 浮点比较的容差，两边的 round2 结果应当完全相同，留一点余量兜住表示误差
const floatTolerance = 1e-9

// maxReported 单个用例最多列出的差异条数
const maxReported = 20

// Load 读入一份基准，读不到或为空直接让测试失败
func Load[I, O any](t *testing.T, path string) []Fixture[I, O] {
	t.Helper()

	raw, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatalf("读取黄金基准失败，先在 web 目录跑 pnpm fixtures：%v", err)
	}

	var fixtures []Fixture[I, O]
	if err = json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatalf("解析黄金基准失败：%v", err)
	}
	if len(fixtures) == 0 {
		t.Fatal("黄金基准里没有用例")
	}
	return fixtures
}

// RequireAtLeast 基准用例数量的下限，防止基准被误删成空壳
func RequireAtLeast(t *testing.T, count, min int) {
	t.Helper()
	if count < min {
		t.Errorf("黄金基准只有 %d 个用例，覆盖不足", count)
	}
}

// Compare 把本实现的结果序列化后与基准逐字段比对，差异最多列 20 条
func Compare(t *testing.T, got any, want json.RawMessage) {
	t.Helper()

	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("序列化失败：%v", err)
	}

	var gotTree, wantTree any
	if err = json.Unmarshal(encoded, &gotTree); err != nil {
		t.Fatalf("回读本实现的结果失败：%v", err)
	}
	if err = json.Unmarshal(want, &wantTree); err != nil {
		t.Fatalf("回读基准失败：%v", err)
	}

	diffs := Diff("chart", gotTree, wantTree)
	limit := min(len(diffs), maxReported)
	for _, d := range diffs[:limit] {
		t.Error(d)
	}
	if len(diffs) > limit {
		t.Errorf("另有 %d 处差异未列出", len(diffs)-limit)
	}
}

// Diff 递归比较两棵 JSON 树，返回差异描述；got 是本实现的结果，want 是 TS 侧的基准
func Diff(path string, got, want any) []string {
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
				out = append(out, Diff(path+"."+k, g, w)...)
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
			out = append(out, Diff(fmt.Sprintf("%s[%d]", path, i), gotValue[i], wantValue[i])...)
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
