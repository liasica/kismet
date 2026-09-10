package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// 命理解读经 DeepSeek 完成，这一层只做转发：把提示词包成 chat completions 请求，
// 再把上游的 SSE 逐行写回客户端，客户端按 OpenAI 兼容格式解析；
// 思考模式下流里先出 reasoning_content 再出 content，思考过程同时打到控制台
const (
	// analyzeRequestBytes 请求体上限，提示词含完整流年也只有几十 KB
	analyzeRequestBytes = 256 << 10
	// analyzeWriteTimeout 单次解读的写超时，流式输出远超服务默认的写超时
	analyzeWriteTimeout = 5 * time.Minute
	// analyzeMaxTokens 生成长度上限，思考与正文都算在内
	analyzeMaxTokens = 32768
	// upstreamErrorBytes 读取上游错误响应的上限
	upstreamErrorBytes = 64 << 10

	defaultDeepSeekBaseURL = "https://api.deepseek.com"
	defaultDeepSeekModel   = "deepseek-v4-flash"
)

// analyzeClient 不设整体超时，流式回复可能持续几分钟，只限制等首字节的时间
var analyzeClient = &http.Client{
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: 60 * time.Second,
	},
}

// DeepSeekConfig DeepSeek 接入配置
type DeepSeekConfig struct {
	APIKey  string
	BaseURL string
	Model   string
}

// Enabled 配了密钥才开放解读接口
func (c DeepSeekConfig) Enabled() bool {
	return c.APIKey != ""
}

// DeepSeekConfigFromEnv 读环境变量 DEEPSEEK_API_KEY、DEEPSEEK_BASE_URL、DEEPSEEK_MODEL
func DeepSeekConfigFromEnv() DeepSeekConfig {
	config := DeepSeekConfig{
		APIKey:  strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		BaseURL: strings.TrimRight(strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")), "/"),
		Model:   strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL")),
	}
	if config.BaseURL == "" {
		config.BaseURL = defaultDeepSeekBaseURL
	}
	if config.Model == "" {
		config.Model = defaultDeepSeekModel
	}
	return config
}

// analyzeRequest 解读请求体，提示词由客户端拼好
type analyzeRequest struct {
	Prompt string `json:"prompt"`
}

// chatMessage OpenAI 兼容的对话消息
type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatRequest OpenAI 兼容的 chat completions 请求体
type chatRequest struct {
	Model     string        `json:"model"`
	Messages  []chatMessage `json:"messages"`
	Stream    bool          `json:"stream"`
	MaxTokens int           `json:"max_tokens"`
}

// streamChunk 流式片段里要看的字段，null 解析为空串；用量只在最后一个片段里
type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *streamUsage `json:"usage"`
}

// streamUsage 生成用量
type streamUsage struct {
	CompletionTokens        int `json:"completion_tokens"`
	CompletionTokensDetails struct {
		ReasoningTokens int `json:"reasoning_tokens"`
	} `json:"completion_tokens_details"`
}

// upstreamError DeepSeek 的错误响应体
type upstreamError struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// handleAnalyze 命理解读，响应为 text/event-stream
func (s *Server) handleAnalyze(w http.ResponseWriter, r *http.Request) {
	if !s.deepSeek.Enabled() {
		writeError(w, apiError{
			status:  http.StatusServiceUnavailable,
			message: "服务端未配置 DEEPSEEK_API_KEY，解读接口不可用",
		})
		return
	}

	prompt, err := parseAnalyzeRequest(r)
	if err != nil {
		writeError(w, err)
		return
	}

	resp, err := s.requestDeepSeek(r.Context(), prompt)
	if err != nil {
		writeError(w, err)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	relayStream(w, resp.Body)
}

// parseAnalyzeRequest 解析并校验解读请求
func parseAnalyzeRequest(r *http.Request) (string, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, analyzeRequestBytes))
	if err != nil {
		return "", badRequest("读取请求体失败")
	}

	var req analyzeRequest
	if err = json.Unmarshal(body, &req); err != nil {
		return "", badRequest("请求体不是合法的 JSON")
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return "", badRequest("prompt 缺失")
	}
	return prompt, nil
}

// requestDeepSeek 发起流式请求，非 200 的上游响应转成 502 并带上对方的错误信息
func (s *Server) requestDeepSeek(ctx context.Context, prompt string) (*http.Response, error) {
	payload, err := json.Marshal(chatRequest{
		Model:     s.deepSeek.Model,
		Messages:  []chatMessage{{Role: "user", Content: prompt}},
		Stream:    true,
		MaxTokens: analyzeMaxTokens,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		s.deepSeek.BaseURL+"/chat/completions",
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.deepSeek.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	resp, err := analyzeClient.Do(req)
	if err != nil {
		return nil, apiError{
			status:  http.StatusBadGateway,
			message: "连接 DeepSeek 失败：" + err.Error(),
		}
	}

	if resp.StatusCode != http.StatusOK {
		message := readUpstreamError(resp.Body)
		_ = resp.Body.Close()
		return nil, apiError{
			status:  http.StatusBadGateway,
			message: fmt.Sprintf("DeepSeek 返回 %d：%s", resp.StatusCode, message),
		}
	}
	return resp, nil
}

// readUpstreamError 取上游错误信息，解析不出来就原样截取正文
func readUpstreamError(body io.Reader) string {
	raw, err := io.ReadAll(io.LimitReader(body, upstreamErrorBytes))
	if err != nil {
		return "读取错误信息失败"
	}

	var parsed upstreamError
	if err = json.Unmarshal(raw, &parsed); err == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}

	text := strings.TrimSpace(string(raw))
	if text == "" {
		return "无错误信息"
	}
	return text
}

// relayStream 把上游的 SSE 逐行写回并刷出，思考过程打到控制台；客户端断开时上游请求随上下文取消
func relayStream(w http.ResponseWriter, body io.Reader) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	controller := http.NewResponseController(w)
	_ = controller.SetWriteDeadline(time.Now().Add(analyzeWriteTimeout))
	w.WriteHeader(http.StatusOK)

	reader := bufio.NewReader(body)
	logger := reasoningLogger{out: os.Stdout}
	defer logger.Flush()

	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			logger.Feed(line)
			if _, writeErr := w.Write(line); writeErr != nil {
				return
			}
			_ = controller.Flush()
		}
		if err != nil {
			if !errors.Is(err, io.EOF) && !errors.Is(err, context.Canceled) {
				_, _ = fmt.Fprintf(os.Stderr, "读取 DeepSeek 流中断 %v\n", err)
			}
			return
		}
	}
}

// reasoningLogger 把流里零散的思考片段拼成整行再输出，流结束时输出结束原因与用量
type reasoningLogger struct {
	out  io.Writer
	line strings.Builder
}

// Feed 解析一行 SSE：思考片段按换行切开输出，正文一出现就把没换行的残余冲出
func (l *reasoningLogger) Feed(raw []byte) {
	payload, ok := bytes.CutPrefix(bytes.TrimSpace(raw), []byte("data:"))
	if !ok {
		return
	}
	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 || bytes.Equal(payload, []byte("[DONE]")) {
		return
	}

	var chunk streamChunk
	if err := json.Unmarshal(payload, &chunk); err != nil || len(chunk.Choices) == 0 {
		return
	}

	choice := chunk.Choices[0]
	if choice.Delta.ReasoningContent != "" {
		l.append(choice.Delta.ReasoningContent)
	}
	if choice.Delta.Content != "" {
		l.Flush()
	}
	if choice.FinishReason != "" {
		l.Flush()
		l.finish(choice.FinishReason, chunk.Usage)
	}
}

// finish 输出结束原因与用量，被 max_tokens 截断时点明
func (l *reasoningLogger) finish(reason string, usage *streamUsage) {
	var b strings.Builder
	_, _ = fmt.Fprintf(&b, "[解读] 结束 finish_reason=%s", reason)
	if usage != nil {
		reasoning := usage.CompletionTokensDetails.ReasoningTokens
		_, _ = fmt.Fprintf(&b, " 思考 %d tokens 正文 %d tokens", reasoning, usage.CompletionTokens-reasoning)
	}
	if reason == "length" {
		b.WriteString("，生成达到 max_tokens 上限被截断")
	}
	_, _ = fmt.Fprintln(l.out, b.String())
}

// append 追加思考片段，每遇到一个换行就输出一行
func (l *reasoningLogger) append(text string) {
	for {
		before, after, found := strings.Cut(text, "\n")
		l.line.WriteString(before)
		if !found {
			return
		}
		l.Flush()
		text = after
	}
}

// Flush 输出攒下的思考内容，空行跳过
func (l *reasoningLogger) Flush() {
	if l.line.Len() > 0 {
		_, _ = fmt.Fprintf(l.out, "[思考] %s\n", l.line.String())
	}
	l.line.Reset()
}
