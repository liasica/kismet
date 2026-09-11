package bazi

import "github.com/liasica/kismet/internal/birth"

// CorrectTime 按八字选项校正时刻，实现在 birth 包
func CorrectTime(input Input, options Options) (birth.CorrectedTime, error) {
	return birth.CorrectTime(input, options.UseTrueSolarTime, options.UseDaylightSaving)
}

// FormatTime 把时刻格式化成 `YYYY-MM-DD HH:mm:ss`
var FormatTime = birth.FormatTime
