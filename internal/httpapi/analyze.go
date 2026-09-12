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

	"github.com/liasica/kismet/internal/bazi"
	"github.com/liasica/kismet/internal/birth"
	"github.com/liasica/kismet/internal/quota"
	"github.com/liasica/kismet/internal/report"
	"github.com/liasica/kismet/internal/ziwei"
)

// 命理解读经 DeepSeek 完成：各体系的解析器排盘并拼提示词（prompt_bazi.go、prompt_ziwei.go）包成 chat completions 请求，
// 再把上游的 SSE 逐行写回客户端，客户端按 OpenAI 兼容格式解析；
// 思考模式下流里先出 reasoning_content 再出 content，思考过程同时打到控制台。
// 请求带 reportId 时，排盘输入在解读开始前存成报告，解读正文在流结束后写回同一份报告
const (
	// analyzeWriteTimeout 单次解读的写超时，流式输出远超服务默认的写超时
	analyzeWriteTimeout = 5 * time.Minute
	// analyzeMaxTokens 生成长度上限，思考与正文都算在内
	analyzeMaxTokens = 32768
	// upstreamErrorBytes 读取上游错误响应的上限
	upstreamErrorBytes = 64 << 10

	defaultDeepSeekBaseURL = "https://api.deepseek.com"
	defaultDeepSeekModel   = "deepseek-flash"
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

// analyzeRequest 解读请求体：排盘输入与该体系的选项，服务端据此排盘并拼提示词
type analyzeRequest struct {
	// ReportID 报告 id，带上时输入与解读结果存成报告；为空则只解读不保存
	ReportID string          `json:"reportId"`
	Input    *birth.Input    `json:"input"`
	Options  json.RawMessage `json:"options"`
}

// analysisPlan 解析后的解读请求：报告要存的内容与要发给模型的消息
type analysisPlan struct {
	// reportID 为空则不保存
	reportID string
	system   string
	input    birth.Input
	// options 合并默认值后的选项，原样存进报告
	options  json.RawMessage
	messages []chatMessage
}

// analysisParser 各体系把请求解析成解读计划：排盘、拼提示词
type analysisParser func(r *http.Request, now time.Time) (analysisPlan, error)

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

// streamUsage 一次生成的用量，只在最后一个片段里
//
// prompt_cache_hit_tokens 与 prompt_cache_miss_tokens 是 DeepSeek 对输入的拆分，
// OpenAI 口径则放在 prompt_tokens_details.cached_tokens，两种都认
type streamUsage struct {
	PromptTokens          int `json:"prompt_tokens"`
	CompletionTokens      int `json:"completion_tokens"`
	PromptCacheHitTokens  int `json:"prompt_cache_hit_tokens"`
	PromptCacheMissTokens int `json:"prompt_cache_miss_tokens"`
	PromptTokensDetails   struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"prompt_tokens_details"`
	CompletionTokensDetails struct {
		ReasoningTokens int `json:"reasoning_tokens"`
	} `json:"completion_tokens_details"`
}

// tokensOf 把上游的用量转成按主体累计的字段
func tokensOf(usage *streamUsage) quota.Tokens {
	if usage == nil {
		return quota.Tokens{}
	}

	hit := usage.PromptCacheHitTokens
	if hit == 0 {
		hit = usage.PromptTokensDetails.CachedTokens
	}
	miss := usage.PromptCacheMissTokens
	if miss == 0 {
		miss = usage.PromptTokens - hit
	}
	return quota.Tokens{
		Prompt:     usage.PromptTokens,
		Completion: usage.CompletionTokens,
		Reasoning:  usage.CompletionTokensDetails.ReasoningTokens,
		CacheHit:   hit,
		CacheMiss:  max(miss, 0),
	}
}

// upstreamError DeepSeek 的错误响应体
type upstreamError struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// handleBaziAnalyze 八字解读
func (s *Server) handleBaziAnalyze(w http.ResponseWriter, r *http.Request) {
	s.serveAnalysis(w, r, s.parseBaziAnalysis)
}

// handleZiweiAnalyze 紫微斗数解读
func (s *Server) handleZiweiAnalyze(w http.ResponseWriter, r *http.Request) {
	s.serveAnalysis(w, r, s.parseZiweiAnalysis)
}

// serveAnalysis 命理解读的公共流程，响应为 text/event-stream
func (s *Server) serveAnalysis(w http.ResponseWriter, r *http.Request, parse analysisParser) {
	if !s.deepSeek.Enabled() {
		writeError(w, apiError{
			status:  http.StatusServiceUnavailable,
			message: "服务端未配置解读服务，解读接口不可用",
		})
		return
	}

	plan, err := parse(r, time.Now())
	if err != nil {
		writeError(w, err)
		return
	}

	client := s.clientOf(r)
	keys := quotaKeysOf(client)
	if err = s.quota.Check(keys...); err != nil {
		writeError(w, quotaError(err))
		return
	}

	// 输入先存成报告，解读中途断开也留得下已生成的正文
	if plan.reportID != "" {
		if err = s.reports.Upsert(report.Draft{
			ID:      plan.reportID,
			System:  plan.system,
			Input:   plan.input,
			Options: plan.options,
			Client:  &client,
		}); err != nil {
			writeError(w, err)
			return
		}
	}

	var resp *http.Response
	if resp, err = s.requestDeepSeek(r.Context(), plan.messages); err != nil {
		writeError(w, err)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	// 上游已经开始生成就算消耗一次，中途断开不退
	s.recordUsage(client, keys)

	content, tokens := relayStream(w, resp.Body)
	if err = s.quota.AddTokens(keys, tokens); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "累计模型用量失败 %v\n", err)
	}

	if plan.reportID == "" || content == "" {
		return
	}
	if err = s.reports.SaveAnalysis(plan.reportID, s.deepSeek.Model, content); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "保存报告 %s 的解读失败 %v\n", plan.reportID, err)
	}
}

// decodeAnalyzeRequest 读请求体并校验必填项与报告 id
func decodeAnalyzeRequest(r *http.Request) (req analyzeRequest, reportID string, err error) {
	if err = decodeJSON(r, maxRequestBytes, &req); err != nil {
		return
	}
	if req.Input == nil {
		err = badRequest("input 缺失")
		return
	}
	if req.ReportID != "" {
		reportID, err = requireReportID(req.ReportID)
	}
	return
}

// parseBaziAnalysis 八字：排盘并按子平法拼提示词
func (s *Server) parseBaziAnalysis(r *http.Request, now time.Time) (plan analysisPlan, err error) {
	req, reportID, err := decodeAnalyzeRequest(r)
	if err != nil {
		return
	}
	patch, err := decodeOptions[bazi.OptionsPatch](req.Options)
	if err != nil {
		return
	}
	chart, err := resolveBaziChart(*req.Input, patch)
	if err != nil {
		return
	}

	plan = analysisPlan{reportID: reportID, system: report.SystemBazi, input: chart.Input}
	if plan.options, err = marshalOptions(chart.Options); err != nil {
		return
	}
	plan.messages, err = baziAnalysisMessages(chart, now)
	return
}

// parseZiweiAnalysis 紫微：排盘并按中州派拼提示词，附知识库里的相关条目
func (s *Server) parseZiweiAnalysis(r *http.Request, now time.Time) (plan analysisPlan, err error) {
	req, reportID, err := decodeAnalyzeRequest(r)
	if err != nil {
		return
	}
	patch, err := decodeOptions[ziwei.OptionsPatch](req.Options)
	if err != nil {
		return
	}
	chart, err := resolveZiweiChart(*req.Input, patch)
	if err != nil {
		return
	}

	plan = analysisPlan{reportID: reportID, system: report.SystemZiwei, input: chart.Input}
	if plan.options, err = marshalOptions(chart.Options); err != nil {
		return
	}
	plan.messages, err = ziweiAnalysisMessages(chart, s.knowledge, now)
	return
}

// requestDeepSeek 发起流式请求，连不上或上游非 200 都转成 502，上游的错误细节只记到控制台
func (s *Server) requestDeepSeek(ctx context.Context, messages []chatMessage) (*http.Response, error) {
	payload, err := json.Marshal(chatRequest{
		Model:     s.deepSeek.Model,
		Messages:  messages,
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
		_, _ = fmt.Fprintf(os.Stderr, "连接解读上游失败 %v\n", err)
		return nil, apiError{status: http.StatusBadGateway, message: "连接解读服务失败"}
	}

	if resp.StatusCode != http.StatusOK {
		message := readUpstreamError(resp.Body)
		_ = resp.Body.Close()
		_, _ = fmt.Fprintf(os.Stderr, "解读上游返回 %d %s\n", resp.StatusCode, message)
		return nil, apiError{
			status:  http.StatusBadGateway,
			message: fmt.Sprintf("解读服务返回 %d", resp.StatusCode),
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

// relayStream 把上游的 SSE 逐行写回并刷出，返回拼好的解读正文与这次的模型用量
//
// 思考过程打到控制台；客户端断开时上游请求随上下文取消，断开前收到的正文照样返回，
// 用量只在最后一个片段里，没走到那一步就是零值
func relayStream(w http.ResponseWriter, body io.Reader) (string, quota.Tokens) {
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	controller := http.NewResponseController(w)
	_ = controller.SetWriteDeadline(time.Now().Add(analyzeWriteTimeout))
	w.WriteHeader(http.StatusOK)

	reader := bufio.NewReader(body)
	monitor := streamMonitor{out: os.Stdout}
	defer monitor.Flush()

	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			monitor.Feed(line)
			if _, writeErr := w.Write(line); writeErr != nil {
				return monitor.Content(), monitor.tokens
			}
			_ = controller.Flush()
		}
		if err != nil {
			if !errors.Is(err, io.EOF) && !errors.Is(err, context.Canceled) {
				_, _ = fmt.Fprintf(os.Stderr, "读取 DeepSeek 流中断 %v\n", err)
			}
			return monitor.Content(), monitor.tokens
		}
	}
}

// streamMonitor 跟着流看片段：思考片段拼成整行输出到控制台，正文片段拼成完整解读；
// 流结束时输出结束原因与用量
type streamMonitor struct {
	out     io.Writer
	line    strings.Builder
	content strings.Builder
	// tokens 这次生成的用量，流走到最后一个片段才有
	tokens quota.Tokens
}

// Feed 解析一行 SSE：思考片段按换行切开输出，正文一出现就把没换行的残余冲出并攒起正文
func (m *streamMonitor) Feed(raw []byte) {
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
		m.append(choice.Delta.ReasoningContent)
	}
	if choice.Delta.Content != "" {
		m.Flush()
		m.content.WriteString(choice.Delta.Content)
	}
	if choice.FinishReason != "" {
		m.Flush()
		m.finish(choice.FinishReason, chunk.Usage)
	}
}

// Content 到目前为止收到的解读正文
func (m *streamMonitor) Content() string {
	return m.content.String()
}

// finish 记下用量并输出结束原因，被 max_tokens 截断时点明
func (m *streamMonitor) finish(reason string, usage *streamUsage) {
	m.tokens = tokensOf(usage)

	var b strings.Builder
	_, _ = fmt.Fprintf(&b, "[解读] 结束 finish_reason=%s", reason)
	if usage != nil {
		tokens := m.tokens
		_, _ = fmt.Fprintf(
			&b,
			" 输入 %d（命中 %d）思考 %d 正文 %d tokens",
			tokens.Prompt,
			tokens.CacheHit,
			tokens.Reasoning,
			tokens.Completion-tokens.Reasoning,
		)
	}
	if reason == "length" {
		b.WriteString("，生成达到 max_tokens 上限被截断")
	}
	_, _ = fmt.Fprintln(m.out, b.String())
}

// append 追加思考片段，每遇到一个换行就输出一行
func (m *streamMonitor) append(text string) {
	for {
		before, after, found := strings.Cut(text, "\n")
		m.line.WriteString(before)
		if !found {
			return
		}
		m.Flush()
		text = after
	}
}

// Flush 输出攒下的思考内容，空行跳过
func (m *streamMonitor) Flush() {
	if m.line.Len() > 0 {
		_, _ = fmt.Fprintf(m.out, "[思考] %s\n", m.line.String())
	}
	m.line.Reset()
}
