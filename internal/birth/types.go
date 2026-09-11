// Package birth 各命理体系共用的出生信息与时间校正
//
// 八字与紫微斗数吃同一份输入，时间校正（夏令时、经度差、均时差）也只有一份。
// 这是 TypeScript 包 @kismet/core 里 src/birth 的 Go 对应实现
package birth

// Gender 性别
type Gender string

const (
	// GenderMale 乾造
	GenderMale Gender = "male"
	// GenderFemale 坤造
	GenderFemale Gender = "female"
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

// Location 出生地回显
type Location struct {
	Name      string   `json:"name,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
}

// LocationOf 有任一出生地信息时构造回显，否则返回 nil
func LocationOf(input Input) *Location {
	if input.Location == "" && input.Longitude == nil && input.Latitude == nil {
		return nil
	}
	return &Location{Name: input.Location, Longitude: input.Longitude, Latitude: input.Latitude}
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
