package qdrant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type Client struct {
	baseURL    string
	collection string
	dim        int
	http       *http.Client
}

type PointPayload struct {
	RepoID       string `json:"repoId"`
	RepoName     string `json:"repoName"`
	RepoURL      string `json:"repoUrl"`
	FilePath     string `json:"filePath"`
	Symbol       string `json:"symbol"`
	Kind         string `json:"kind"`
	SymbolKind   string `json:"symbolKind"`
	Language     string `json:"language"`
	PackageName  string `json:"packageName"`
	ClassName    string `json:"className"`
	MethodName   string `json:"methodName"`
	StartLine    int    `json:"startLine"`
	EndLine      int    `json:"endLine"`
	DocComment   string `json:"docComment"`
	QualifiedRef string `json:"qualifiedRef"`
	Snippet      string `json:"snippet"`
	DocID        string `json:"docId"`
}

type SearchHit struct {
	Score   float64
	Payload PointPayload
}

func NewClient(baseURL, collection string, dim int) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		collection: collection,
		dim:        dim,
		http:       &http.Client{},
	}
}

func (c *Client) EnsureCollection(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/collections/%s", c.baseURL, c.collection), nil)
	resp, err := c.http.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		resp.Body.Close()
		return nil
	}
	if resp != nil {
		resp.Body.Close()
	}
	body, _ := json.Marshal(map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     c.dim,
			"distance": "Cosine",
		},
	})
	req, err = http.NewRequestWithContext(ctx, http.MethodPut, fmt.Sprintf("%s/collections/%s", c.baseURL, c.collection), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err = c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("create collection: %s", string(raw))
	}
	return nil
}

func (c *Client) UpsertPoints(ctx context.Context, points []map[string]interface{}) error {
	if len(points) == 0 {
		return nil
	}
	body, _ := json.Marshal(map[string]interface{}{"points": points})
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		fmt.Sprintf("%s/collections/%s/points?wait=true", c.baseURL, c.collection), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upsert points: %s", string(raw))
	}
	return nil
}

func (c *Client) Search(ctx context.Context, vector []float32, limit int) ([]SearchHit, error) {
	return c.searchWithFilter(ctx, vector, limit, nil)
}

// SearchCodeSymbols 搜索代码符号，在服务端过滤掉知识文档，避免知识文档抢占代码符号名额。
func (c *Client) SearchCodeSymbols(ctx context.Context, vector []float32, limit int) ([]SearchHit, error) {
	filter := map[string]interface{}{
		"must_not": []map[string]interface{}{
			{
				"key":   "kind",
				"match": map[string]interface{}{"value": "knowledge_doc"},
			},
		},
	}
	return c.searchWithFilter(ctx, vector, limit, filter)
}

// SearchKnowledgeDocs 仅搜索知识文档，过滤掉代码符号。
func (c *Client) SearchKnowledgeDocs(ctx context.Context, vector []float32, limit int) ([]SearchHit, error) {
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "kind",
				"match": map[string]interface{}{"value": "knowledge_doc"},
			},
		},
	}
	return c.searchWithFilter(ctx, vector, limit, filter)
}

func (c *Client) searchWithFilter(ctx context.Context, vector []float32, limit int, filter map[string]interface{}) ([]SearchHit, error) {
	if limit <= 0 {
		limit = 5
	}
	body := map[string]interface{}{
		"vector":       vector,
		"limit":        limit,
		"with_payload": true,
	}
	if filter != nil {
		body["filter"] = filter
	}
	reqBody, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/collections/%s/points/search", c.baseURL, c.collection), bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("search status %d", resp.StatusCode)
	}
	var decoded struct {
		Result []struct {
			Score   float64                `json:"score"`
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, err
	}
	hits := make([]SearchHit, 0, len(decoded.Result))
	for _, item := range decoded.Result {
		p := item.Payload
		hits = append(hits, SearchHit{
			Score: item.Score,
			Payload: PointPayload{
				RepoID:       fmt.Sprint(p["repoId"]),
				RepoName:     fmt.Sprint(p["repoName"]),
				RepoURL:      fmt.Sprint(p["repoUrl"]),
				FilePath:     fmt.Sprint(p["filePath"]),
				Symbol:       fmt.Sprint(p["symbol"]),
				Kind:         fmt.Sprint(p["kind"]),
				SymbolKind:   fmt.Sprint(p["symbolKind"]),
				Language:     fmt.Sprint(p["language"]),
				PackageName:  fmt.Sprint(p["packageName"]),
				ClassName:    fmt.Sprint(p["className"]),
				MethodName:   fmt.Sprint(p["methodName"]),
				StartLine:    intFromPayload(p["startLine"]),
				EndLine:      intFromPayload(p["endLine"]),
				DocComment:   fmt.Sprint(p["docComment"]),
				QualifiedRef: fmt.Sprint(p["qualifiedRef"]),
				Snippet:      fmt.Sprint(p["snippet"]),
				DocID:        fmt.Sprint(p["docId"]),
			},
		})
	}
	return hits, nil
}

func intFromPayload(v interface{}) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	default:
		return 0
	}
}

// DeleteByDocID removes all vector points whose payload.docId matches.
func (c *Client) DeleteByDocID(ctx context.Context, docID string) error {
	if docID == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{
					"key":   "docId",
					"match": map[string]interface{}{"value": docID},
				},
			},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/collections/%s/points/delete?wait=true", c.baseURL, c.collection), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete points: %s", string(raw))
	}
	return nil
}

// DeleteByRepoID removes all vector points whose payload.repoId matches.
func (c *Client) DeleteByRepoID(ctx context.Context, repoID string) error {
	if repoID == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{
					"key":   "repoId",
					"match": map[string]interface{}{"value": repoID},
				},
			},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/collections/%s/points/delete?wait=true", c.baseURL, c.collection), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete points: %s", string(raw))
	}
	return nil
}

// HashEmbed produces a deterministic pseudo-embedding for indexing without external API.
func HashEmbed(text string, dim int) []float32 {
	vec := make([]float32, dim)
	for i, ch := range text {
		vec[i%dim] += float32(int(ch)%997) / 997.0
	}
	return vec
}
