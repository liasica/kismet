// Package ziwei 紫微斗数排盘
//
// 这是 TypeScript 包 @kismet/core 里 src/ziwei 的 Go 对应实现，口径取中州派（王亭之讲义），
// 输出的 JSON 结构逐字段一致，由 data/fixtures/ziwei-charts.json 里的黄金基准约束。
// 规则与流派差异见 web/core/README.md 的紫微一节
package ziwei

import "github.com/liasica/kismet/internal/birth"

// Options 选项，时间相关三项与八字同义
type Options struct {
	// UseTrueSolarTime 真太阳时校正，为 true 时必须给经度
	UseTrueSolarTime bool `json:"useTrueSolarTime"`
	// UseDaylightSaving 输入按夏令时钟表读数处理，只影响 1986 至 1991 年
	UseDaylightSaving bool `json:"useDaylightSaving"`
	// LateZiAsNextDay 晚子时是否算次日，中州派以零时为一日之始，默认 false
	LateZiAsNextDay bool `json:"lateZiAsNextDay"`
	// MaxAge 小限与流年输出到多少虚岁
	MaxAge int `json:"maxAge"`
}

// DefaultOptions 选项默认值
var DefaultOptions = Options{MaxAge: 100}

// OptionsPatch 只覆盖给出的那几项选项，字段是指针，nil 表示调用方没给
type OptionsPatch struct {
	UseTrueSolarTime  *bool `json:"useTrueSolarTime"`
	UseDaylightSaving *bool `json:"useDaylightSaving"`
	LateZiAsNextDay   *bool `json:"lateZiAsNextDay"`
	MaxAge            *int  `json:"maxAge"`
}

// Apply 把给出的项覆盖到基准选项上
func (p OptionsPatch) Apply(base Options) Options {
	if p.UseTrueSolarTime != nil {
		base.UseTrueSolarTime = *p.UseTrueSolarTime
	}
	if p.UseDaylightSaving != nil {
		base.UseDaylightSaving = *p.UseDaylightSaving
	}
	if p.LateZiAsNextDay != nil {
		base.LateZiAsNextDay = *p.LateZiAsNextDay
	}
	if p.MaxAge != nil {
		base.MaxAge = *p.MaxAge
	}
	return base
}

// maxAgeLowerBound、maxAgeUpperBound 小限虚岁的合法区间，与 HTTP 层 checkZiweiOptions 的校验一致
//
// HTTP 层只挡住了走接口的请求，命令行等直接调用本包的调用方不经过那层校验；
// minorLimitAgesOf 按 MaxAge 循环并把每个虚岁都装进切片，这里兜底夹住取值，
// 避免异常大的 MaxAge 把循环撑爆
const (
	maxAgeLowerBound = 1
	maxAgeUpperBound = 200
)

// ResolveOptions 把补丁合到默认值上，并把 MaxAge 夹到 [1, 200] 之间
func ResolveOptions(patch OptionsPatch) Options {
	options := patch.Apply(DefaultOptions)
	if options.MaxAge < maxAgeLowerBound {
		options.MaxAge = maxAgeLowerBound
	}
	if options.MaxAge > maxAgeUpperBound {
		options.MaxAge = maxAgeUpperBound
	}
	return options
}

// Star 宫内的一颗星，只有正曜与辅佐煞曜有庙陷，四化只标生年四化
type Star struct {
	Name       string `json:"name"`
	Brightness string `json:"brightness,omitempty"`
	Mutation   string `json:"mutation,omitempty"`
}

// Decade 大限一步
type Decade struct {
	// Index 自命宫起第几步，命宫为 0
	Index     int `json:"index"`
	StartAge  int `json:"startAge"`
	EndAge    int `json:"endAge"`
	StartYear int `json:"startYear"`
	EndYear   int `json:"endYear"`
}

// Palace 一宫
type Palace struct {
	// Index 自命宫逆布的序号，命宫 0、兄弟 1 …… 父母 11
	Index        int    `json:"index"`
	Name         string `json:"name"`
	Branch       string `json:"branch"`
	Stem         string `json:"stem"`
	SixtyCycle   string `json:"sixtyCycle"`
	IsBodyPalace bool   `json:"isBodyPalace"`
	// MajorStars 十四正曜
	MajorStars []Star `json:"majorStars"`
	// MinorStars 辅佐煞曜
	MinorStars []Star `json:"minorStars"`
	// AdjectiveStars 杂曜
	AdjectiveStars []Star `json:"adjectiveStars"`
	// ChangSheng 长生十二神
	ChangSheng string `json:"changSheng"`
	// BoShi 博士十二神
	BoShi  string `json:"boShi"`
	Decade Decade `json:"decade"`
	// MinorLimitAges 小限落在此宫的虚岁
	MinorLimitAges []int `json:"minorLimitAges"`
}

// Lunar 农历生辰
type Lunar struct {
	Year           int    `json:"year"`
	YearSixtyCycle string `json:"yearSixtyCycle"`
	Month          int    `json:"month"`
	Leap           bool   `json:"leap"`
	Day            int    `json:"day"`
	// EffectiveMonth 安星所用的月份，闰月十六起按下一个月
	EffectiveMonth int    `json:"effectiveMonth"`
	HourBranch     string `json:"hourBranch"`
	Text           string `json:"text"`
}

// Bureau 五行局
type Bureau struct {
	Name    string `json:"name"`
	Element string `json:"element"`
	Number  int    `json:"number"`
}

// Mutation 四化的一条
type Mutation struct {
	Star     string `json:"star"`
	Mutation string `json:"mutation"`
}

// Chart 排盘结果
type Chart struct {
	Name       string          `json:"name,omitempty"`
	Gender     birth.Gender    `json:"gender"`
	Input      birth.Input     `json:"input"`
	Options    Options         `json:"options"`
	Location   *birth.Location `json:"location,omitempty"`
	Time       birth.TimeInfo  `json:"time"`
	Lunar      Lunar           `json:"lunar"`
	YearStem   string          `json:"yearStem"`
	YearBranch string          `json:"yearBranch"`
	// Yang 阳年生
	Yang bool `json:"yang"`
	// Forward 阳男阴女为 true，大限、长生、博士顺行
	Forward    bool   `json:"forward"`
	LifePalace string `json:"lifePalace"`
	BodyPalace string `json:"bodyPalace"`
	Bureau     Bureau `json:"bureau"`
	LifeMaster string `json:"lifeMaster"`
	BodyMaster string `json:"bodyMaster"`
	// Mutations 生年四化，按禄权科忌
	Mutations []Mutation `json:"mutations"`
	// Palaces 十二宫，按地支子至亥
	Palaces []Palace `json:"palaces"`
}

// FlowStar 流曜的一颗
type FlowStar struct {
	Name   string `json:"name"`
	Branch string `json:"branch"`
}

// Flow 大限或流年的流曜
type Flow struct {
	// Scope decade 或 year
	Scope      string `json:"scope"`
	Stem       string `json:"stem"`
	Branch     string `json:"branch"`
	SixtyCycle string `json:"sixtyCycle"`
	// LifePalace 大限为大限宫地支，流年为太岁宫地支
	LifePalace string     `json:"lifePalace"`
	Stars      []FlowStar `json:"stars"`
	Mutations  []Mutation `json:"mutations"`
}

// Year 一个流年
type Year struct {
	Flow
	Year int `json:"year"`
	// Age 虚岁
	Age int `json:"age"`
	// SuiQian 岁前十二神，按地支子至亥
	SuiQian []string `json:"suiQian"`
	// JiangQian 将前十二神，按地支子至亥
	JiangQian []string `json:"jiangQian"`
	// DouJun 斗君所在地支
	DouJun string `json:"douJun"`
	// MinorLimit 小限所在地支
	MinorLimit string `json:"minorLimit"`
}

// Limit 某个日期所处的运限
type Limit struct {
	LunarYear int `json:"lunarYear"`
	Age       int `json:"age"`
	// Decade 起限之前为 nil
	Decade *Decade `json:"decade,omitempty"`
	Yearly Year    `json:"yearly"`
}
