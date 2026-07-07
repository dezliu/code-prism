package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client 调用智谱 Chat API（兼容 OpenAI 格式）
type Client struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
}

// Message 聊天消息
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// NewClient 从环境变量创建 LLM 客户端。
// 如果 ZHIPU_API_KEY 为空，返回 nil（表示 LLM 不可用）。
func NewClient() *Client {
	apiKey := getEnv("ZHIPU_API_KEY", "")
	if apiKey == "" {
		apiKey = getEnv("OPENAI_API_KEY", "")
	}
	if apiKey == "" {
		return nil
	}

	baseURL := getEnv("ZHIPU_BASE_URL", "")
	if baseURL == "" {
		baseURL = getEnv("OPENAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
	}
	model := getEnv("ZHIPU_MODEL", "")
	if model == "" {
		model = getEnv("OPENAI_MODEL", "glm-4-flash")
	}

	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		model:   model,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// ChatComplete 调用 Chat API 返回文本响应。
// 失败时返回 error，调用方应做降级处理。
func (c *Client) ChatComplete(ctx context.Context, messages []Message, temperature float64) (string, error) {
	if c == nil {
		return "", fmt.Errorf("llm client is nil")
	}

	body := map[string]interface{}{
		"model":       c.model,
		"messages":    messages,
		"temperature": temperature,
	}
	data, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("chat request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("chat status %d: %s", resp.StatusCode, string(raw))
	}

	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if len(decoded.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return decoded.Choices[0].Message.Content, nil
}

// Available 返回 LLM 是否可用
func (c *Client) Available() bool {
	return c != nil && c.apiKey != ""
}

// Model 返回当前模型名
func (c *Client) Model() string {
	if c == nil {
		return ""
	}
	return c.model
}

func (c *Client) String() string {
	if c == nil {
		return "llm: unavailable"
	}
	return fmt.Sprintf("llm: %s/%s", c.baseURL, c.model)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
