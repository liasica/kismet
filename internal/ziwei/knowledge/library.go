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

	"github.com/liasica/kismet/internal/ziwei"
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

// MajorStars 十四正曜的表序，直接引用 ziwei 包导出的那份，不再自己维护一份副本
var MajorStars = ziwei.MajorStars

// PalaceNames 十二宫，直接引用 ziwei 包导出的那份，不再自己维护一份副本
var PalaceNames = ziwei.PalaceNames

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
