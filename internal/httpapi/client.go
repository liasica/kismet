package httpapi

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"os"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/liasica/kismet/internal/quota"
	"github.com/liasica/kismet/internal/report"
)

// 客户端身份：真实 IP、UA 与浏览器指纹，配额按它限次，后台按它展示
//
// 部署时链路是 Cloudflare -> 宿主 nginx -> 容器，容器只绑回环地址。转发头能被客户端伪造，
// 所以只在直连方是回环或私有地址时才采信，否则一律用连接的对端地址。默认认 X-Real-IP：
// 它由反代自己写入，客户端带来的同名头会被覆盖；Cloudflare 的 CF-Connecting-IP 则是原样
// 透传的，绕过边缘直连源站就能伪造，真实 IP 交给 nginx 的 realip 模块从 CF 地址段还原
const (
	// realIPHeaderDefault 默认的真实 IP 头
	realIPHeaderDefault = "X-Real-IP"
	// realIPHeaderOff REAL_IP_HEADER 取这个值时不认任何转发头，只用对端地址
	realIPHeaderOff = "none"
	// fingerprintHeader 浏览器指纹头，由前端带上
	fingerprintHeader = "X-Client-Id"
	// userAgentMaxBytes UA 存下来的长度上限
	userAgentMaxBytes = 512
)

// fingerprintPattern 指纹取自指纹库的 visitorId，只认十六进制那一类短串
var fingerprintPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// realIPHeader 真实 IP 头的名字，取环境变量 REAL_IP_HEADER
//
// 缺失或为空都落到默认头，部署时漏配一个空值不至于把所有人并成同一个来源
func realIPHeader() string {
	switch raw := strings.TrimSpace(os.Getenv("REAL_IP_HEADER")); raw {
	case "":
		return realIPHeaderDefault
	case realIPHeaderOff:
		return ""
	default:
		return raw
	}
}

// clientOf 取请求的客户端身份
func (s *Server) clientOf(r *http.Request) report.Client {
	return report.Client{
		IP:          s.realIP(r),
		UserAgent:   truncate(r.UserAgent(), userAgentMaxBytes),
		Fingerprint: fingerprintOf(r),
	}
}

// realIP 请求的真实来源 IP
func (s *Server) realIP(r *http.Request) string {
	peer := peerIP(r)
	if s.realIPHeader == "" || !isInternal(peer) {
		return peer
	}

	if forwarded := parseIP(r.Header.Get(s.realIPHeader)); forwarded != "" {
		return forwarded
	}
	// 反代没给指定的头时退到 X-Forwarded-For，取最后一跳：前面的可以由客户端伪造，
	// 最后一个才是直连方看到的地址
	if chain := r.Header.Get("X-Forwarded-For"); chain != "" {
		hops := strings.Split(chain, ",")
		if last := parseIP(hops[len(hops)-1]); last != "" {
			return last
		}
	}
	return peer
}

// peerIP 连接对端的地址
func peerIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return parseIP(r.RemoteAddr)
	}
	return parseIP(host)
}

// parseIP 规范化一个 IP 文本，不合法时返回空串
func parseIP(raw string) string {
	address, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return address.Unmap().String()
}

// isInternal 是不是回环或私有地址，只有这样的直连方才是自己的反代
func isInternal(raw string) bool {
	address, err := netip.ParseAddr(raw)
	if err != nil {
		return false
	}
	return address.IsLoopback() || address.IsPrivate() || address.IsLinkLocalUnicast()
}

// fingerprintOf 取请求头里的浏览器指纹，格式不对当作没有
func fingerprintOf(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get(fingerprintHeader))
	if !fingerprintPattern.MatchString(value) {
		return ""
	}
	return value
}

// quotaKeysOf 客户端对应的配额主体：指纹在前，命中就先按它报错
func quotaKeysOf(client report.Client) []quota.Key {
	return []quota.Key{
		quota.ClientKey(client.Fingerprint, client.IP),
		quota.IPKey(client.IP),
	}
}

// recordUsage 记一次消耗，写失败只记到控制台，不影响这次解读
func (s *Server) recordUsage(client report.Client, keys []quota.Key) {
	entries := make([]quota.Entry, 0, len(keys))
	for _, key := range keys {
		entries = append(entries, quota.Entry{Key: key, UserAgent: client.UserAgent, IP: client.IP})
	}

	if err := s.quota.Record(entries...); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "记录配额用量失败 %v\n", err)
	}
}

// quotaError 把配额错误转成带状态码的接口错误
func quotaError(err error) error {
	var exceeded quota.LimitError
	switch {
	case errors.Is(err, quota.ErrBlocked):
		return apiError{status: http.StatusForbidden, message: "这个客户端已被限制使用解读"}
	case errors.As(err, &exceeded):
		return apiError{status: http.StatusTooManyRequests, message: exceeded.Error()}
	}
	return err
}

// truncate 按字节截断，尾部不留半个字符
func truncate(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	for limit > 0 && !utf8.RuneStart(text[limit]) {
		limit--
	}
	return text[:limit]
}
