package quota

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// ConfigFromEnv 读环境变量 FREE_QUOTA_CLIENT、FREE_QUOTA_IP、FREE_QUOTA_WINDOW
//
// 两个额度填 0 即该层不限次，窗口按 Go 的时长写法，如 `24h`、`30m`
func ConfigFromEnv() Config {
	return Config{
		ClientLimit: envInt("FREE_QUOTA_CLIENT", defaultClientLimit),
		IPLimit:     envInt("FREE_QUOTA_IP", defaultIPLimit),
		Window:      envDuration("FREE_QUOTA_WINDOW", defaultWindow),
	}
}

// Describe 启动时打印的一行说明
func (c Config) Describe() string {
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

// envInt 读一个非负整数，缺失或不合法时用默认值
func envInt(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}

	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return fallback
	}
	return value
}

// envDuration 读一个正时长，缺失或不合法时用默认值
func envDuration(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}

	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
