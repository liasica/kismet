package httpapi

import (
	"fmt"
	"strings"
	"time"

	"github.com/liasica/kismet/internal/birth"
)

// 解读的提示词：固定的角色与批命规则放 system 消息，命主信息、今天的日期、所处的运限、
// 文字命盘与章节清单放 user 消息，固定内容在前才能命中上游的前缀缓存。
// 章节清单按虚岁分成人与未成年人两套，未成年人面向父母，不谈婚姻、财运与事业。
// 八字在 prompt_bazi.go，紫微在 prompt_ziwei.go

// beijingZone 「今天」按北京时间算，服务可能跑在 UTC 的容器里
var beijingZone = time.FixedZone("Asia/Shanghai", 8*3600)

// minorMaxAge 虚岁不超过这个数按未成年人批命
const minorMaxAge = 18

// subjectLine 「命主：张三，男性，阳历 1990 年 5 月 3 日 12:30 出生，出生地北京市。」
func subjectLine(
	name string,
	gender birth.Gender,
	input birth.Input,
	location *birth.Location,
) string {
	genderText := "女性"
	if gender == birth.GenderMale {
		genderText = "男性"
	}

	var b strings.Builder
	b.WriteString("命主：")
	if name != "" {
		b.WriteString(name)
		b.WriteString("，")
	}
	_, _ = fmt.Fprintf(
		&b,
		"%s，阳历 %d 年 %d 月 %d 日 %02d:%02d 出生",
		genderText, input.Year, input.Month, input.Day, input.Hour, input.Minute,
	)
	if location != nil && location.Name != "" {
		b.WriteString("，出生地")
		b.WriteString(location.Name)
	}
	b.WriteString("。")
	return b.String()
}
