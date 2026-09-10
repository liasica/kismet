// Package bazi 八字排盘
//
// 这是 TypeScript 包 `@kismet/core` 的 Go 对应实现。两边共用同一个 tyme 库
// （tyme4go 与 tyme4ts 同代），自实现的部分逐个移植，输出的 JSON 结构逐字段一致，
// 由 `data/fixtures/charts.json` 里的黄金基准约束
package bazi

// Gender 性别
type Gender string

const (
	// GenderMale 乾造
	GenderMale Gender = "male"
	// GenderFemale 坤造
	GenderFemale Gender = "female"
)

// PillarKind 柱
type PillarKind string

const (
	PillarYear  PillarKind = "year"
	PillarMonth PillarKind = "month"
	PillarDay   PillarKind = "day"
	PillarHour  PillarKind = "hour"
)

// HideStemType 地支藏干的层次
type HideStemType string

const (
	// HideStemMain 本气
	HideStemMain HideStemType = "main"
	// HideStemMiddle 中气
	HideStemMiddle HideStemType = "middle"
	// HideStemResidual 余气
	HideStemResidual HideStemType = "residual"
)

// QiYunPrecision 起运折算精度
type QiYunPrecision string

const (
	// QiYunByDay 折到日
	QiYunByDay QiYunPrecision = "day"
	// QiYunByHour 折到时辰
	QiYunByHour QiYunPrecision = "hour"
)

// Input 排盘输入，时刻一律视为北京时间的钟表读数
type Input struct {
	Year   int    `json:"year"`
	Month  int    `json:"month"`
	Day    int    `json:"day"`
	Hour   int    `json:"hour"`
	Minute int    `json:"minute"`
	Gender Gender `json:"gender"`
	// Name 姓名，仅用于结果展示
	Name string `json:"name,omitempty"`
	// Longitude 出生地经度，东经为正，用于真太阳时。0 度是合法经度，故用指针区分未给
	Longitude *float64 `json:"longitude,omitempty"`
	// Latitude 出生地纬度，北纬为正，随结果回显，不参与计算
	Latitude *float64 `json:"latitude,omitempty"`
	// Location 出生地显示名
	Location string `json:"location,omitempty"`
}

// Options 流派选项，每一项都对应一处分歧，取值含义见 web/core/README.md
type Options struct {
	// UseTrueSolarTime 真太阳时校正，为 true 时必须给经度
	UseTrueSolarTime bool `json:"useTrueSolarTime"`
	// UseDaylightSaving 输入按夏令时钟表读数处理，只影响 1986 至 1991 年
	UseDaylightSaving bool `json:"useDaylightSaving"`
	// LateZiAsNextDay 晚子时是否算次日日柱
	LateZiAsNextDay bool `json:"lateZiAsNextDay"`
	// QiYunPrecision 起运折算精度
	QiYunPrecision QiYunPrecision `json:"qiYunPrecision"`
	// ShenShaSkipBasePillar 神煞的基准柱自身不再标注
	ShenShaSkipBasePillar bool `json:"shenShaSkipBasePillar"`
	// MaxAge 流年输出到多少虚岁
	MaxAge int `json:"maxAge"`
	// ElementStrategy 五行评分策略名
	ElementStrategy string `json:"elementStrategy"`
}

// HideStem 地支藏干的一位
type HideStem struct {
	Stem string       `json:"stem"`
	Type HideStemType `json:"type"`
	// TenStar 该藏干对日主的十神
	TenStar string `json:"tenStar"`
	Element string `json:"element"`
}

// Pillar 一柱
type Pillar struct {
	Kind PillarKind `json:"kind"`
	// SixtyCycle 干支，如「庚午」
	SixtyCycle    string `json:"sixtyCycle"`
	Stem          string `json:"stem"`
	Branch        string `json:"branch"`
	StemElement   string `json:"stemElement"`
	BranchElement string `json:"branchElement"`
	// StemTenStar 天干对日主的十神，日柱为「日主」
	StemTenStar string     `json:"stemTenStar"`
	HideStems   []HideStem `json:"hideStems"`
	// Sound 纳音
	Sound string `json:"sound"`
	// Terrain 日干在本柱地支的十二长生，问真称「星运」
	Terrain string `json:"terrain"`
	// SelfTerrain 本柱天干在本柱地支的十二长生，问真称「自坐」
	SelfTerrain string `json:"selfTerrain"`
	// Ten 本柱所在旬
	Ten string `json:"ten"`
	// ExtraBranches 本柱自身的旬空地支
	ExtraBranches []string `json:"extraBranches"`
	// Empty 本柱地支是否落在日柱旬空内
	Empty bool `json:"empty"`
}

// Pillars 四柱
type Pillars struct {
	Year  Pillar `json:"year"`
	Month Pillar `json:"month"`
	Day   Pillar `json:"day"`
	Hour  Pillar `json:"hour"`
}

// TermPoint 节气交节点
type TermPoint struct {
	Name string `json:"name"`
	// Time 格式 `YYYY-MM-DD HH:mm:ss`
	Time string `json:"time"`
}

// TimeInfo 时间校正的全过程
type TimeInfo struct {
	// Input 输入原始时刻
	Input string `json:"input"`
	// Standard 夏令时回拨后的标准北京时间
	Standard string `json:"standard"`
	// Effective 实际用于排盘的时刻
	Effective string `json:"effective"`
	// DaylightSavingMinutes 夏令时回拨的分钟数，未命中区间为 0
	DaylightSavingMinutes int `json:"daylightSavingMinutes"`
	// LongitudeMinutes 经度差偏移分钟数
	LongitudeMinutes float64 `json:"longitudeMinutes"`
	// EquationOfTimeMinutes 均时差分钟数
	EquationOfTimeMinutes float64 `json:"equationOfTimeMinutes"`
	// MeanSolar 地方平太阳时，未开真太阳时则与 Standard 相同
	MeanSolar string `json:"meanSolar"`
	// Lunar 农历日期
	Lunar string `json:"lunar"`
	// Zodiac 生肖
	Zodiac string `json:"zodiac"`
	// Term 所处节气
	Term TermPoint `json:"term"`
	// PrevJie 上一个节
	PrevJie TermPoint `json:"prevJie"`
	// NextJie 下一个节
	NextJie TermPoint `json:"nextJie"`
}

// ElementContribution 单个五行的得分明细
type ElementContribution struct {
	Source  string  `json:"source"`
	Element string  `json:"element"`
	Weight  float64 `json:"weight"`
	Reason  string  `json:"reason"`
}

// ElementScores 五行分值，键用英文，中文只出现在展示层
type ElementScores struct {
	Wood  float64 `json:"wood"`
	Fire  float64 `json:"fire"`
	Earth float64 `json:"earth"`
	Metal float64 `json:"metal"`
	Water float64 `json:"water"`
}

// SeasonalState 月令主导的旺相休囚死
type SeasonalState struct {
	Wood  string `json:"wood"`
	Fire  string `json:"fire"`
	Earth string `json:"earth"`
	Metal string `json:"metal"`
	Water string `json:"water"`
}

// ElementReport 五行强弱结果
type ElementReport struct {
	Strategy string        `json:"strategy"`
	Scores   ElementScores `json:"scores"`
	Total    float64       `json:"total"`
	// SupportScore 日主同类得分，比劫加印星
	SupportScore float64 `json:"supportScore"`
	// OpposeScore 日主异类得分
	OpposeScore float64 `json:"opposeScore"`
	// Strength 日主旺衰倾向
	Strength      string                `json:"strength"`
	SeasonalState SeasonalState         `json:"seasonalState"`
	Contributions []ElementContribution `json:"contributions"`
}

// ShenShaHit 一条命中的神煞
type ShenShaHit struct {
	Name   string     `json:"name"`
	Pillar PillarKind `json:"pillar"`
	// Matched 命中的干支字
	Matched string `json:"matched"`
	// By 查法基准与基准值，如「年支午」
	By   string `json:"by"`
	Note string `json:"note"`
}

// QiYun 起运
type QiYun struct {
	// Forward 顺排为 true
	Forward     bool `json:"forward"`
	YearCount   int  `json:"yearCount"`
	MonthCount  int  `json:"monthCount"`
	DayCount    int  `json:"dayCount"`
	HourCount   int  `json:"hourCount"`
	MinuteCount int  `json:"minuteCount"`
	// StartTime 起运时刻
	StartTime string `json:"startTime"`
	// StartAge 起运虚岁
	StartAge int `json:"startAge"`
	// Term 折算所依据的那个节
	Term      TermPoint      `json:"term"`
	Precision QiYunPrecision `json:"precision"`
	// Text 「出生后 0 年 10 月 12 天 4 时 起运」
	Text string `json:"text"`
}

// FortuneYear 流年
type FortuneYear struct {
	Year int `json:"year"`
	// Age 虚岁
	Age         int    `json:"age"`
	SixtyCycle  string `json:"sixtyCycle"`
	StemTenStar string `json:"stemTenStar"`
	// BranchTenStar 地支本气藏干对日主的十神
	BranchTenStar string `json:"branchTenStar"`
	// MinorFortune 小运干支
	MinorFortune string `json:"minorFortune"`
}

// DecadeFortuneStep 大运一步
type DecadeFortuneStep struct {
	Index         int           `json:"index"`
	SixtyCycle    string        `json:"sixtyCycle"`
	StemTenStar   string        `json:"stemTenStar"`
	BranchTenStar string        `json:"branchTenStar"`
	StartAge      int           `json:"startAge"`
	EndAge        int           `json:"endAge"`
	StartYear     int           `json:"startYear"`
	EndYear       int           `json:"endYear"`
	Years         []FortuneYear `json:"years"`
}

// FortuneMonth 流月，以节为界
type FortuneMonth struct {
	// TermName 节名
	TermName string `json:"termName"`
	// TermTime 交节时刻
	TermTime      string `json:"termTime"`
	SixtyCycle    string `json:"sixtyCycle"`
	StemTenStar   string `json:"stemTenStar"`
	BranchTenStar string `json:"branchTenStar"`
}

// Location 出生地回显
type Location struct {
	Name      string   `json:"name,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
}

// Extras 胎元、胎息、命宫、身宫
type Extras struct {
	FetalOrigin string `json:"fetalOrigin"`
	FetalBreath string `json:"fetalBreath"`
	OwnSign     string `json:"ownSign"`
	BodySign    string `json:"bodySign"`
}

// Chart 排盘结果
type Chart struct {
	Name     string    `json:"name,omitempty"`
	Gender   Gender    `json:"gender"`
	Input    Input     `json:"input"`
	Options  Options   `json:"options"`
	Location *Location `json:"location,omitempty"`
	Time     TimeInfo  `json:"time"`
	Pillars  Pillars   `json:"pillars"`
	// DayStem 日主天干
	DayStem        string `json:"dayStem"`
	DayStemElement string `json:"dayStemElement"`
	// EmptyBranches 以日柱旬取的空亡地支
	EmptyBranches []string            `json:"emptyBranches"`
	Elements      ElementReport       `json:"elements"`
	ShenSha       []ShenShaHit        `json:"shenSha"`
	QiYun         QiYun               `json:"qiYun"`
	Decades       []DecadeFortuneStep `json:"decades"`
	// Months 出生当年的流月
	Months []FortuneMonth `json:"months"`
	Extras Extras         `json:"extras"`
}
