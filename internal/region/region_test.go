package region

import (
	"os"
	"path/filepath"
	"testing"
)

// testDataDir 数据目录相对包目录的位置
var testDataDir = filepath.Join("..", "..", "data", "region")

func load(t *testing.T) *Store {
	t.Helper()

	store, err := Load(os.DirFS(testDataDir))
	if err != nil {
		t.Fatalf("载入区划数据失败：%v", err)
	}
	return store
}

// TestHierarchy 逐条实测跳级模型
func TestHierarchy(t *testing.T) {
	store := load(t)

	// 东莞市：直筒子市，无区县，镇街直接挂在市下
	dongguan := store.Children("441900")
	t.Logf("东莞市 441900：Children=%d HasTowns=%v TownCount=%d Towns=%d",
		len(dongguan), store.HasTowns("441900"), store.TownCount("441900"), len(store.Towns("441900")))
	if len(dongguan) != 0 || !store.HasTowns("441900") || store.TownCount("441900") != 36 || len(store.Towns("441900")) != 36 {
		t.Errorf("东莞市不符合预期")
	}

	// 北京市、重庆市：区县直接挂在省下，不经过市级
	for _, tc := range []struct {
		code string
		name string
		want int
	}{
		{"110000", "北京市", 16},
		{"500000", "重庆市", 38},
	} {
		children := store.Children(tc.code)
		levels := map[string]int{}
		for _, item := range children {
			levels[item.Level]++
		}
		t.Logf("%s %s：Children=%d levels=%v", tc.name, tc.code, len(children), levels)
		if len(children) != tc.want || levels[LevelCounty] != tc.want {
			t.Errorf("%s 期望 %d 条 county，实得 %d 条 %v", tc.name, tc.want, len(children), levels)
		}
	}

	// 香港、澳门：只有省与区县两级，且没有乡镇
	for _, tc := range []struct {
		code string
		name string
	}{
		{"810000", "香港特别行政区"},
		{"820000", "澳门特别行政区"},
	} {
		children := store.Children(tc.code)
		townTotal := 0
		for _, item := range children {
			townTotal += store.TownCount(item.Code)
		}
		t.Logf("%s %s：Children=%d 首条 level=%s HasTowns=%v 子级乡镇合计=%d",
			tc.name, tc.code, len(children), children[0].Level, store.HasTowns(tc.code), townTotal)
		if store.HasTowns(tc.code) || townTotal != 0 {
			t.Errorf("%s 不应有乡镇", tc.name)
		}
		for _, item := range children {
			if item.Level != LevelCounty {
				t.Errorf("%s 的子级 %s 层级是 %s，期望 county", tc.name, item.Code, item.Level)
			}
		}
	}

	// 台湾省：省 -> 市 -> 区县，无乡镇
	taiwan := store.Children("710000")
	grandTotal, grandTowns := 0, 0
	for _, city := range taiwan {
		if city.Level != LevelCity {
			t.Errorf("台湾省的子级 %s 层级是 %s，期望 city", city.Code, city.Level)
		}
		for _, county := range store.Children(city.Code) {
			grandTotal++
			if county.Level != LevelCounty {
				t.Errorf("台湾省 %s 的子级 %s 层级是 %s，期望 county", city.Name, county.Code, county.Level)
			}
			grandTowns += store.TownCount(county.Code)
		}
	}
	t.Logf("台湾省 710000：Children=%d 全为 city，孙级 county=%d 条，乡镇合计=%d", len(taiwan), grandTotal, grandTowns)
	if len(taiwan) != 20 || grandTowns != 0 {
		t.Errorf("台湾省期望 20 条 city 且无乡镇，实得 %d 条、乡镇 %d", len(taiwan), grandTowns)
	}

	// 济源市：省直辖县级行政区，父级直接是省
	jiyuan, ok := store.Find("419001")
	t.Logf("济源市 419001：found=%v level=%s Children=%d TownCount=%d FullName=%q",
		ok, jiyuan.Level, len(store.Children("419001")), store.TownCount("419001"), store.FullName("419001"))
	if !ok || jiyuan.Level != LevelCounty || len(store.Children("419001")) != 0 || store.TownCount("419001") != 16 {
		t.Errorf("济源市不符合预期")
	}

	// 樟木头镇：9 位乡镇代码
	town, found := store.Find("441900112")
	ancestors := store.Ancestors("441900112")
	names := make([]string, 0, len(ancestors))
	for _, item := range ancestors {
		names = append(names, item.Name)
	}
	t.Logf("樟木头镇 441900112：found=%v name=%s level=%s lng=%.4f lat=%.4f FullName=%q Ancestors=%v",
		found, town.Name, town.Level, town.Lng, town.Lat, store.FullName("441900112"), names)
	if !found || town.Name != "樟木头镇" || town.Level != LevelTown {
		t.Errorf("樟木头镇未命中")
	}
	if town.Lng != 114.0833 || town.Lat != 22.9149 {
		t.Errorf("樟木头镇经纬度期望 114.0833/22.9149，实得 %.4f/%.4f", town.Lng, town.Lat)
	}
	if store.FullName("441900112") != "广东省 东莞市 樟木头镇" {
		t.Errorf("樟木头镇 FullName 实得 %q", store.FullName("441900112"))
	}
	if len(names) != 2 || names[0] != "广东省" || names[1] != "东莞市" {
		t.Errorf("樟木头镇 Ancestors 实得 %v", names)
	}
}

// TestCounts 数据规模与经纬度完整性
func TestCounts(t *testing.T) {
	store := load(t)

	divisionTotal, townTotal, zeroCoord := 0, 0, 0
	for _, item := range store.byCode {
		if item.Level == LevelTown {
			townTotal++
		} else {
			divisionTotal++
		}
		if item.Lng == 0 || item.Lat == 0 {
			zeroCoord++
		}
	}

	t.Logf("省级=%d 前三级总数=%d 乡镇总数=%d 经纬度为 0 的条数=%d",
		len(store.Provinces()), divisionTotal, townTotal, zeroCoord)

	if len(store.Provinces()) != 34 {
		t.Errorf("省级期望 34，实得 %d", len(store.Provinces()))
	}
	if divisionTotal != 4032 {
		t.Errorf("前三级期望 4032，实得 %d", divisionTotal)
	}
	if townTotal != 41350 {
		t.Errorf("乡镇期望 41350，实得 %d", townTotal)
	}
	if zeroCoord != 0 {
		t.Errorf("经纬度为 0 的条数期望 0，实得 %d", zeroCoord)
	}
}

// TestSliceIsolation 返回的切片是拷贝，改不到内部索引
func TestSliceIsolation(t *testing.T) {
	store := load(t)

	first := store.Provinces()
	first[0].Name = "改坏了"
	if store.Provinces()[0].Name == "改坏了" {
		t.Errorf("Provinces 返回的不是拷贝")
	}

	towns := store.Towns("441900")
	towns[0].Name = "改坏了"
	if store.Towns("441900")[0].Name == "改坏了" {
		t.Errorf("Towns 返回的不是拷贝")
	}
}

// TestSearch 跨级搜索
//
// 期望值取自 TypeScript 侧 searchRegions 的实际输出，两端的匹配打分与排序规则
// 必须一致：同一个词在两端搜出来的顺序应当相同
func TestSearch(t *testing.T) {
	store := load(t)

	cases := []struct {
		keyword string
		limit   int
		want    []string
	}{
		{
			keyword: "樟木头",
			limit:   3,
			want:    []string{"广东省 东莞市 樟木头镇"},
		},
		{
			// 市级完全相等排在前，同名乡镇按代码升序跟在后面
			keyword: "东莞",
			limit:   3,
			want: []string{
				"广东省 东莞市",
				"山东省 日照市 莒县 东莞镇",
				"广东省 韶关市 南雄市 东莞大岭山（南雄）产业转移工业园",
			},
		},
		{
			// 省级前缀匹配优先于乡镇的包含匹配
			keyword: "广东",
			limit:   2,
			want: []string{
				"广东省",
				"湖南省 衡阳市 珠晖区 广东路街道",
			},
		},
		{
			// 同为完全相等时，市在区县之前
			keyword: "朝阳",
			limit:   2,
			want: []string{
				"辽宁省 朝阳市",
				"北京市 朝阳区",
			},
		},
	}

	for _, c := range cases {
		got := store.Search(c.keyword, c.limit)
		if len(got) != len(c.want) {
			t.Errorf("搜索 %q 得到 %d 条，期望 %d 条", c.keyword, len(got), len(c.want))
			continue
		}
		for i, want := range c.want {
			if got[i].FullName != want {
				t.Errorf("搜索 %q 第 %d 条是 %q，期望 %q", c.keyword, i+1, got[i].FullName, want)
			}
		}
	}
}

// TestSearchPath 命中项的代码路径末项是自身，前面是逐级祖先
func TestSearchPath(t *testing.T) {
	store := load(t)

	got := store.Search("樟木头", 1)
	if len(got) != 1 {
		t.Fatalf("期望 1 条命中，得到 %d 条", len(got))
	}

	want := []string{"440000", "441900", "441900112"}
	if len(got[0].Path) != len(want) {
		t.Fatalf("路径长度 %d，期望 %d：%v", len(got[0].Path), len(want), got[0].Path)
	}
	for i, code := range want {
		if got[0].Path[i] != code {
			t.Errorf("路径第 %d 项是 %s，期望 %s", i+1, got[0].Path[i], code)
		}
	}
}

// TestSearchEmpty 空查询不返回结果
func TestSearchEmpty(t *testing.T) {
	store := load(t)
	for _, keyword := range []string{"", "   "} {
		if got := store.Search(keyword, 10); len(got) != 0 {
			t.Errorf("查询 %q 应当没有结果，得到 %d 条", keyword, len(got))
		}
	}
}
