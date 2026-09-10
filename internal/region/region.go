// Package region 中国行政区划查询
//
// 数据与 Web 端共用一份 JSON：省市区县三级在 `divisions.json`，乡镇按省切成 31 个
// 分片放在 `towns/`。服务端不需要懒加载，`Load` 一次把全部数据读入内存建索引，
// 之后所有查询都是同步的、无 IO、无错误返回。数据以 fs.FS 传入，main 包用
// go:embed 把仓库根的 data/region 编进二进制，测试用 os.DirFS 读源码树。
//
// # 层级可以跳级
//
// 树按实际管辖关系建，某一级缺位时直接跳过：
//   - 直筒子市（东莞、中山、儋州、嘉峪关等）没有区县，镇街直接挂在市下，
//     此时 Children 为空，Towns 返回镇街
//   - 直辖市与省直辖县级行政区的区县直接挂在省下，不经过市级
//   - 香港、澳门只有省与区县两级，台湾只有省、市、乡镇市区（按区县级存放）
//
// 所以调用方不要按固定级数写死流程，改为看返回条目自身的 Level，
// 并用 HasTowns 判断还要不要再往下取一级
package region

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"sort"
	"strings"
)

// 行政层级
const (
	LevelProvince = "province"
	LevelCity     = "city"
	LevelCounty   = "county"
	LevelTown     = "town"
)

// scale 数据文件里经纬度的放大倍数
const scale = 1e4

// codeWidthDivision 前三级代码的位宽
const codeWidthDivision = 6

// codeWidthTown 乡镇代码的位宽
const codeWidthTown = 9

// Region 一个行政区划节点
type Region struct {
	Code  string  `json:"code"`
	Name  string  `json:"name"`
	Level string  `json:"level"`
	Lng   float64 `json:"lng"`
	Lat   float64 `json:"lat"`
}

// rawShard 数据文件的存储结构
//
// Codes 是代码升序后的差值序列，真实代码由前缀累加得出；Names 用 `|` 分隔，
// 顺序与 Codes 一致；Lng 与 Lat 是放大 10000 倍的整数；TownCounts 只有
// `divisions.json` 有，记每个节点下直接挂着的乡镇条数
type rawShard struct {
	Codes      []int  `json:"codes"`
	Names      string `json:"names"`
	Lng        []int  `json:"lng"`
	Lat        []int  `json:"lat"`
	TownCounts []int  `json:"townCounts"`
}

// Store 区划数据的内存索引
type Store struct {
	byCode     map[string]Region   // 前三级与乡镇共用一张表，Find 因此同时认 6 位与 9 位
	children   map[string][]Region // 父级代码 -> 下一级子区划，只覆盖前三级
	towns      map[string][]Region // 6 位父级代码 -> 直接挂着的乡镇
	townCounts map[string]int      // 父级代码 -> 乡镇条数，不必展开 towns 就能判断
	provinces  []Region
	// all 全部四级，按代码升序，搜索按它遍历，同分项的先后才是确定的
	all []Region
}

// Load 从数据目录载入全部区划，目录根下应有 divisions.json 与 towns/
func Load(fsys fs.FS) (*Store, error) {
	var divisions rawShard
	if err := readJSON(fsys, "divisions.json", &divisions); err != nil {
		return nil, err
	}

	list, err := decode(&divisions, codeWidthDivision, levelOfCode)
	if err != nil {
		return nil, err
	}

	store := &Store{
		byCode:     make(map[string]Region, len(list)),
		children:   make(map[string][]Region),
		towns:      make(map[string][]Region),
		townCounts: make(map[string]int),
		provinces:  make([]Region, 0, 34),
	}
	store.all = make([]Region, 0, len(list))
	for _, item := range list {
		store.byCode[item.Code] = item
		store.all = append(store.all, item)
	}

	// 挂树要靠 byCode 判断推出来的市级是否存在，所以放在整张表填完之后
	for i, item := range list {
		if item.Level == LevelProvince {
			store.provinces = append(store.provinces, item)
		} else if parent := store.parentCodeOf(item.Code); parent != "" {
			store.children[parent] = append(store.children[parent], item)
		}

		if i < len(divisions.TownCounts) && divisions.TownCounts[i] > 0 {
			store.townCounts[item.Code] = divisions.TownCounts[i]
		}
	}

	if err = store.readTownShards(fsys, "towns"); err != nil {
		return nil, err
	}
	return store, nil
}

// readTownShards 读入 towns 目录下的全部分片，乡镇的父级就是代码的前 6 位
func (s *Store) readTownShards(fsys fs.FS, dir string) error {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return fmt.Errorf("读取乡镇分片目录 %s 失败：%w", dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() || path.Ext(entry.Name()) != ".json" {
			continue
		}

		var shard rawShard
		if err = readJSON(fsys, path.Join(dir, entry.Name()), &shard); err != nil {
			return err
		}

		var towns []Region
		if towns, err = decode(&shard, codeWidthTown, levelOfTown); err != nil {
			return err
		}

		for _, town := range towns {
			s.byCode[town.Code] = town
			s.all = append(s.all, town)
			parent := town.Code[:codeWidthDivision]
			s.towns[parent] = append(s.towns[parent], town)
		}
	}

	// 分片按目录顺序读入，这里统一按代码升序，搜索里同分项的先后才是确定的
	slices.SortFunc(s.all, func(a, b Region) int {
		return strings.Compare(a.Code, b.Code)
	})
	return nil
}

// Provinces 省、自治区、直辖市、特别行政区，含台湾省
func (s *Store) Provinces() []Region {
	return cloneRegions(s.provinces)
}

// Children 下一级子区划，只覆盖省、市、区县三级
//
// 返回空有三种情况：该级下确实没有子区划、下一级是乡镇（改用 Towns）、代码不存在。
// 用 HasTowns 区分第二种
func (s *Store) Children(code string) []Region {
	return cloneRegions(s.children[code])
}

// Towns 该节点下直接挂着的乡镇
//
// code 一般是 6 位区县代码，直筒子市传市级代码，只有两级的港澳传省级代码
func (s *Store) Towns(code string) []Region {
	return cloneRegions(s.towns[code])
}

// HasTowns 该节点下是否直接挂着乡镇
func (s *Store) HasTowns(code string) bool {
	return s.townCounts[code] > 0
}

// TownCount 该节点下直接挂着的乡镇条数，没有则为 0
func (s *Store) TownCount(code string) int {
	return s.townCounts[code]
}

// Find 按代码查单条，同时认 6 位的前三级与 9 位的乡镇
func (s *Store) Find(code string) (Region, bool) {
	item, ok := s.byCode[code]
	return item, ok
}

// Ancestors 从省级到直接父级的祖先链，不含自身
//
// 祖先一定落在前三级，拼完整地址：append(Ancestors(code), self)
func (s *Store) Ancestors(code string) []Region {
	chain := make([]Region, 0, 3)
	for cursor := s.parentCodeOf(code); cursor != ""; {
		parent, ok := s.byCode[cursor]
		if !ok {
			break
		}
		chain = append(chain, parent)
		cursor = s.parentCodeOf(parent.Code)
	}

	// 推导是自下而上的，反转成省级在前
	slices.Reverse(chain)
	return chain
}

// FullName 从省级拼到自身的全名，用空格分隔，例如「广东省 东莞市 樟木头镇」；查不到返回空串
func (s *Store) FullName(code string) string {
	self, ok := s.Find(code)
	if !ok {
		return ""
	}

	chain := s.Ancestors(code)
	names := make([]string, 0, len(chain)+1)
	for _, item := range chain {
		names = append(names, item.Name)
	}
	names = append(names, self.Name)
	return strings.Join(names, " ")
}

// parentCodeOf 父级代码，靠代码本身的分级编码推出，零额外存储；到省级返回空串
//
// 乡镇取前 6 位，区县取前 4 位补 `00`，市级取前 2 位补 `0000`。推出的市级不存在时
// （直辖市、省直辖县级行政区、香港、澳门）再退一级到省，跳级就是这么落地的
func (s *Store) parentCodeOf(code string) string {
	if len(code) == codeWidthTown {
		return code[:codeWidthDivision]
	}
	if len(code) != codeWidthDivision || strings.HasSuffix(code, "0000") {
		return ""
	}

	city := code[:4] + "00"
	if code != city {
		if _, ok := s.byCode[city]; ok {
			return city
		}
	}
	return code[:2] + "0000"
}

// decode 把差值序列与 `|` 分隔的名称还原成区划列表
func decode(shard *rawShard, width int, level func(code string) string) ([]Region, error) {
	names := strings.Split(shard.Names, "|")
	if len(names) != len(shard.Codes) || len(shard.Lng) != len(shard.Codes) || len(shard.Lat) != len(shard.Codes) {
		return nil, fmt.Errorf(
			"区划数据字段长度不一致：codes %d、names %d、lng %d、lat %d",
			len(shard.Codes),
			len(names),
			len(shard.Lng),
			len(shard.Lat),
		)
	}

	list := make([]Region, 0, len(shard.Codes))
	value := 0
	for i, delta := range shard.Codes {
		value += delta
		code := fmt.Sprintf("%0*d", width, value)
		list = append(list, Region{
			Code:  code,
			Name:  names[i],
			Level: level(code),
			Lng:   float64(shard.Lng[i]) / scale,
			Lat:   float64(shard.Lat[i]) / scale,
		})
	}
	return list, nil
}

// levelOfCode 按代码判定层级：长度 9 是乡镇，否则以 `0000` 结尾是省、以 `00` 结尾是市、其余是区县
func levelOfCode(code string) string {
	switch {
	case len(code) == codeWidthTown:
		return LevelTown
	case strings.HasSuffix(code, "0000"):
		return LevelProvince
	case strings.HasSuffix(code, "00"):
		return LevelCity
	default:
		return LevelCounty
	}
}

// levelOfTown 乡镇分片里的条目层级固定
func levelOfTown(string) string {
	return LevelTown
}

// cloneRegions 返回切片拷贝，避免调用方改到内部索引
func cloneRegions(list []Region) []Region {
	out := make([]Region, len(list))
	copy(out, list)
	return out
}

// readJSON 读一个 JSON 文件并解析到 target
func readJSON(fsys fs.FS, name string, target any) error {
	data, err := fs.ReadFile(fsys, name)
	if err != nil {
		return fmt.Errorf("读取区划数据 %s 失败：%w", name, err)
	}
	if err = json.Unmarshal(data, target); err != nil {
		return fmt.Errorf("解析区划数据 %s 失败：%w", name, err)
	}
	return nil
}

// Match 一条搜索命中
type Match struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	Level string `json:"level"`
	// FullName 从省级到自身的完整地名，如「广东省 东莞市 樟木头镇」
	FullName string `json:"fullName"`
	// Path 从省级到自身的代码路径，末项即自身
	Path []string `json:"path"`
}

// SearchLimitDefault 搜索默认返回条数
const SearchLimitDefault = 50

// levelOrder 层级的排序权重，同分时省在前、乡镇在后
var levelOrder = map[string]int{
	LevelProvince: 0,
	LevelCity:     1,
	LevelCounty:   2,
	LevelTown:     3,
}

// matchScore 匹配质量，完全相等最优，其次前缀，最后包含
func matchScore(name, query string) int {
	switch {
	case name == query:
		return 3
	case strings.HasPrefix(name, query):
		return 2
	case strings.Contains(name, query):
		return 1
	}
	return 0
}

// Search 按名称跨级搜索区划
//
// 四级都会命中，结果按匹配质量排序，同分时省市在前、乡镇在后。
// 排序规则与 TypeScript 侧的 searchRegions 一致，两端搜同一个词得到同样的顺序。
// 空查询返回空结果
func (s *Store) Search(query string, limit int) []Match {
	keyword := strings.TrimSpace(query)
	if keyword == "" {
		return nil
	}
	if limit <= 0 {
		limit = SearchLimitDefault
	}

	type scored struct {
		region Region
		score  int
	}

	hits := make([]scored, 0, limit)
	for _, item := range s.all {
		if score := matchScore(item.Name, keyword); score > 0 {
			hits = append(hits, scored{region: item, score: score})
		}
	}

	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		gap := levelOrder[hits[i].region.Level] - levelOrder[hits[j].region.Level]
		if gap != 0 {
			return gap < 0
		}
		return hits[i].region.Code < hits[j].region.Code
	})

	if len(hits) > limit {
		hits = hits[:limit]
	}

	out := make([]Match, 0, len(hits))
	for _, hit := range hits {
		ancestors := s.Ancestors(hit.region.Code)
		path := make([]string, 0, len(ancestors)+1)
		names := make([]string, 0, len(ancestors)+1)
		for _, a := range ancestors {
			path = append(path, a.Code)
			names = append(names, a.Name)
		}
		path = append(path, hit.region.Code)
		names = append(names, hit.region.Name)

		out = append(out, Match{
			Code:     hit.region.Code,
			Name:     hit.region.Name,
			Level:    hit.region.Level,
			FullName: strings.Join(names, " "),
			Path:     path,
		})
	}
	return out
}
