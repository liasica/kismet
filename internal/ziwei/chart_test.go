package ziwei_test

import (
	"testing"
	"time"

	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/fixturetest"
	"github.com/liasica/kismet/internal/ziwei"
)

// 与 TypeScript 包 @kismet/core 的一致性测试，基准由 web 目录的 `pnpm fixtures:ziwei` 生成

const fixturePath = "../../data/fixtures/ziwei-charts.json"

func TestChartMatchesTypeScript(t *testing.T) {
	fixtures := fixturetest.Load[birth.Input, ziwei.OptionsPatch](t, fixturePath)

	for _, f := range fixtures {
		t.Run(f.Label, func(t *testing.T) {
			chart, err := ziwei.Paipan(f.Input, ziwei.ResolveOptions(f.Options))
			if err != nil {
				t.Fatalf("排盘失败：%v", err)
			}
			fixturetest.Compare(t, chart, f.Chart)
			fixturetest.CompareText(t, ziwei.ToText(chart), f.Text)
		})
	}
}

func TestFixtureCoverage(t *testing.T) {
	fixturetest.RequireAtLeast(t, len(fixturetest.Load[birth.Input, ziwei.OptionsPatch](t, fixturePath)), 60)
}

// TestYearlyAndLimit 流年与所处运限，期望值与 TS 侧 chart.test.ts 相同
func TestYearlyAndLimit(t *testing.T) {
	chart, err := ziwei.Paipan(
		birth.Input{Year: 1990, Month: 5, Day: 3, Hour: 12, Minute: 30, Gender: birth.GenderMale},
		ziwei.DefaultOptions,
	)
	if err != nil {
		t.Fatalf("排盘失败：%v", err)
	}

	yearly, err := ziwei.Yearly(chart, 2026)
	if err != nil {
		t.Fatalf("流年失败：%v", err)
	}
	if yearly.SixtyCycle != "丙午" || yearly.Age != 37 || yearly.LifePalace != "午" || yearly.DouJun != "酉" || yearly.MinorLimit != "辰" {
		t.Errorf("流年 2026 不符：%+v", yearly)
	}
	stars := map[string]string{}
	for _, s := range yearly.Stars {
		stars[s.Name] = s.Branch
	}
	if stars["流禄"] != "巳" || stars["流曲"] != "午" || stars["年解"] != "辰" || stars["流马"] != "申" {
		t.Errorf("流曜不符：%v", stars)
	}
	if yearly.SuiQian[6] != "岁建" || yearly.JiangQian[6] != "将星" {
		t.Errorf("岁前将前不符：%v %v", yearly.SuiQian, yearly.JiangQian)
	}

	var limit ziwei.Limit
	limit, err = ziwei.LimitAt(chart, time.Date(2026, 9, 11, 12, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600)))
	if err != nil {
		t.Fatalf("运限失败：%v", err)
	}
	if limit.Age != 37 || limit.Decade == nil || limit.Decade.Index != 3 || limit.Decade.StartAge != 35 {
		t.Errorf("所处运限不符：%+v", limit)
	}

	var flow ziwei.Flow
	if flow, err = ziwei.DecadeFlow(chart, 3); err != nil {
		t.Fatalf("大限流曜失败：%v", err)
	}
	if flow.SixtyCycle != "戊寅" || flow.Mutations[0].Star != "贪狼" {
		t.Errorf("大限流曜不符：%+v", flow)
	}
	if _, err = ziwei.DecadeFlow(chart, 12); err == nil {
		t.Error("越界的大限序号应报错")
	}
}
