package bazi_test

import (
	"testing"

	"github.com/liasica/kismet/internal/bazi"
	"github.com/liasica/kismet/internal/fixturetest"
)

// 与 TypeScript 包 @kismet/core 的一致性测试，基准由 web 目录的 `pnpm fixtures:bazi` 生成

// fixturePath 黄金基准相对本包的位置
const fixturePath = "../../data/fixtures/bazi-charts.json"

func TestChartMatchesTypeScript(t *testing.T) {
	fixtures := fixturetest.Load[bazi.Input, bazi.OptionsPatch](t, fixturePath)

	for _, f := range fixtures {
		t.Run(f.Label, func(t *testing.T) {
			chart, err := bazi.Paipan(f.Input, bazi.ResolveOptions(f.Options))
			if err != nil {
				t.Fatalf("排盘失败：%v", err)
			}
			fixturetest.Compare(t, chart, f.Chart)
		})
	}
}

func TestFixtureCoverage(t *testing.T) {
	fixturetest.RequireAtLeast(t, len(fixturetest.Load[bazi.Input, bazi.OptionsPatch](t, fixturePath)), 40)
}
