package quota

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// 后台改动额度时的取值范围
const (
	limitMax  = 100000
	windowMin = time.Minute
	windowMax = 30 * 24 * time.Hour
)

// DefaultConfig 后台没改过时的额度
var DefaultConfig = Config{
	ClientLimit: defaultClientLimit,
	IPLimit:     defaultIPLimit,
	Window:      defaultWindow,
}

// Config 额度与窗口，由后台改，存在数据文件里
type Config struct {
	// ClientLimit 单个浏览器指纹在窗口内的次数，0 即不限
	ClientLimit int `json:"clientLimit"`
	// IPLimit 单个 IP 在窗口内的次数，0 即不限
	IPLimit int           `json:"ipLimit"`
	Window  time.Duration `json:"window"`
	// WhitelistOnly 开启后只有白名单主体能解读，其余一律拒绝
	WhitelistOnly bool `json:"whitelistOnly"`
}

// Validate 校验额度与窗口
func (c Config) Validate() error {
	if c.ClientLimit < 0 || c.ClientLimit > limitMax {
		return fmt.Errorf("浏览器额度应在 0 到 %d 之间，收到 %d", limitMax, c.ClientLimit)
	}
	if c.IPLimit < 0 || c.IPLimit > limitMax {
		return fmt.Errorf("IP 额度应在 0 到 %d 之间，收到 %d", limitMax, c.IPLimit)
	}
	if c.Window < windowMin || c.Window > windowMax {
		return fmt.Errorf("窗口应在 %v 到 %v 之间，收到 %v", windowMin, windowMax, c.Window)
	}
	return nil
}

// Describe 启动时打印的一行说明
func (c Config) Describe() string {
	if c.WhitelistOnly {
		return "只对白名单开放"
	}
	if c.ClientLimit <= 0 && c.IPLimit <= 0 {
		return "不限次"
	}

	var parts []string
	if c.ClientLimit > 0 {
		parts = append(parts, strconv.Itoa(c.ClientLimit)+" 次/客户端")
	}
	if c.IPLimit > 0 {
		parts = append(parts, strconv.Itoa(c.IPLimit)+" 次/IP")
	}
	return strings.Join(parts, "，") + "，窗口 " + c.Window.String()
}
