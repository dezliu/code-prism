package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

type Client struct {
	baseURL   string
	apiKey    string
	model     string
	dim       int
	http      *http.Client
	useHash   bool
}

func NewClient(dim int) *Client {
	apiKey := getEnv("ZHIPU_API_KEY", "")
	if apiKey == "" {
		apiKey = getEnv("OPENAI_API_KEY", "")
	}
	baseURL := getEnv("ZHIPU_BASE_URL", "")
	if baseURL == "" {
		baseURL = getEnv("OPENAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
	}
	model := getEnv("ZHIPU_EMBEDDING_MODEL", "embedding-3")
	if model == "" {
		model = getEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
	}

	useHash := apiKey == "" || getEnv("EMBEDDING_USE_HASH", "") == "true"

	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		model:   model,
		dim:     dim,
		http:    &http.Client{},
		useHash: useHash,
	}
}

func (c *Client) Embed(ctx context.Context, text string) ([]float32, error) {
	if c.useHash {
		return hashEmbed(text, c.dim), nil
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model": c.model,
		"input": text,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return hashEmbed(text, c.dim), nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return hashEmbed(text, c.dim), nil
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return hashEmbed(text, c.dim), nil
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return hashEmbed(text, c.dim), nil
	}

	var decoded struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil || len(decoded.Data) == 0 {
		return hashEmbed(text, c.dim), nil
	}

	vec := make([]float32, 0, len(decoded.Data[0].Embedding))
	for _, v := range decoded.Data[0].Embedding {
		vec = append(vec, float32(v))
	}
	if len(vec) == 0 {
		return hashEmbed(text, c.dim), nil
	}
	return vec, nil
}

func hashEmbed(text string, dim int) []float32 {
	vec := make([]float32, dim)
	for i, ch := range text {
		vec[i%dim] += float32(int(ch)%997) / 997.0
	}
	return vec
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func (c *Client) UsesHashFallback() bool {
	return c.useHash
}

func (c *Client) ModelName() string {
	return c.model
}

func (c *Client) Dim() int {
	return c.dim
}

func (c *Client) String() string {
	if c.useHash {
		return fmt.Sprintf("hash-fallback(dim=%d)", c.dim)
	}
	return fmt.Sprintf("%s/%s", c.baseURL, c.model)
}
