package opensearchstore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const DefaultIndex = "lingprism_search"

type Client struct {
	baseURL string
	index   string
	http    *http.Client
	enabled bool
}

type SearchDocument struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`
	Title   string  `json:"title"`
	Snippet string  `json:"snippet"`
	Ref     string  `json:"ref"`
	RepoID  string  `json:"repoId,omitempty"`
	Score   float64 `json:"score,omitempty"`
}

// CodeSymbolDocument holds enriched symbol metadata for exact lookup.
type CodeSymbolDocument struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	RepoID       string `json:"repoId"`
	RepoName     string `json:"repoName,omitempty"`
	RepoURL      string `json:"repoUrl,omitempty"`
	FilePath     string `json:"filePath"`
	Language     string `json:"language,omitempty"`
	PackageName  string `json:"packageName,omitempty"`
	ClassName    string `json:"className,omitempty"`
	MethodName   string `json:"methodName,omitempty"`
	Symbol       string `json:"symbol"`
	SymbolKind   string `json:"symbolKind,omitempty"`
	StartLine    int    `json:"startLine"`
	EndLine      int    `json:"endLine"`
	DocComment   string `json:"docComment,omitempty"`
	QualifiedRef string  `json:"qualifiedRef"`
	Snippet      string  `json:"snippet"`
	Score        float64 `json:"score,omitempty"`
}

func NewClient(baseURL string) *Client {
	url := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	return &Client{
		baseURL: url,
		index:   DefaultIndex,
		http:    &http.Client{},
		enabled: url != "",
	}
}

func (c *Client) Enabled() bool {
	return c.enabled
}

func (c *Client) EnsureIndex(ctx context.Context) error {
	if !c.enabled {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, fmt.Sprintf("%s/%s", c.baseURL, c.index), nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		resp.Body.Close()
		return nil
	}
	if resp != nil {
		resp.Body.Close()
	}

	body, _ := json.Marshal(map[string]interface{}{
		"mappings": map[string]interface{}{
			"properties": map[string]interface{}{
				"type":         map[string]string{"type": "keyword"},
				"title":        map[string]string{"type": "text"},
				"snippet":      map[string]string{"type": "text"},
				"ref":          map[string]string{"type": "keyword"},
				"repoId":       map[string]string{"type": "keyword"},
				"symbol":       map[string]string{"type": "text"},
				"methodName":   map[string]string{"type": "keyword"},
				"className":    map[string]string{"type": "keyword"},
				"qualifiedRef": map[string]string{"type": "keyword"},
				"docComment":   map[string]string{"type": "text"},
				"filePath":     map[string]string{"type": "keyword"},
			},
		},
	})
	putReq, err := http.NewRequestWithContext(ctx, http.MethodPut, fmt.Sprintf("%s/%s", c.baseURL, c.index), bytes.NewReader(body))
	if err != nil {
		return err
	}
	putReq.Header.Set("Content-Type", "application/json")
	resp, err = c.http.Do(putReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("create index: %s", string(raw))
	}
	return nil
}

func (c *Client) Search(ctx context.Context, query string, repoIDs []string, limit int) ([]SearchDocument, error) {
	if !c.enabled || strings.TrimSpace(query) == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 8
	}

	filters := []map[string]interface{}{}
	if len(repoIDs) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{"repoId": repoIDs},
		})
	}

	body, _ := json.Marshal(map[string]interface{}{
		"size": limit,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must": []map[string]interface{}{
					{
						"multi_match": map[string]interface{}{
							"query":  query,
							"fields": []string{"title^2", "snippet", "symbol", "docComment"},
						},
					},
				},
				"filter": filters,
			},
		},
	})

	return c.runSearch(ctx, body)
}

// SearchCodeSymbols performs symbol-focused lookup (exact + fuzzy).
func (c *Client) SearchCodeSymbols(
	ctx context.Context,
	query, className, methodName string,
	repoIDs []string,
	limit int,
) ([]CodeSymbolDocument, error) {
	if !c.enabled {
		return nil, nil
	}
	if limit <= 0 {
		limit = 8
	}

	filters := []map[string]interface{}{
		{"term": map[string]interface{}{"type": "code_symbol"}},
	}
	if len(repoIDs) > 0 {
		filters = append(filters, map[string]interface{}{
			"terms": map[string]interface{}{"repoId": repoIDs},
		})
	}

	should := []map[string]interface{}{}
	if methodName != "" {
		should = append(should, map[string]interface{}{
			"term": map[string]interface{}{"methodName": map[string]interface{}{"value": methodName, "boost": 5.0}},
		})
	}
	if className != "" {
		should = append(should, map[string]interface{}{
			"term": map[string]interface{}{"className": map[string]interface{}{"value": className, "boost": 3.0}},
		})
	}
	if query != "" {
		should = append(should,
			map[string]interface{}{
				"term": map[string]interface{}{"qualifiedRef": map[string]interface{}{"value": query, "boost": 10.0}},
			},
			map[string]interface{}{
				"multi_match": map[string]interface{}{
					"query":  query,
					"fields": []string{"docComment^6", "snippet^5", "symbol^1.5", "qualifiedRef^1"},
					"type":   "best_fields",
				},
			},
		)
	}
	if len(should) == 0 {
		return nil, nil
	}

	body, _ := json.Marshal(map[string]interface{}{
		"size": limit,
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"filter":               filters,
				"should":               should,
				"minimum_should_match": 1,
			},
		},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/%s/_search", c.baseURL, c.index), bytes.NewReader(body))
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
		return nil, fmt.Errorf("opensearch status %d", resp.StatusCode)
	}

	var decoded struct {
		Hits struct {
			Hits []struct {
				Score  float64                `json:"_score"`
				Source map[string]interface{} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, err
	}

	docs := make([]CodeSymbolDocument, 0, len(decoded.Hits.Hits))
	for _, hit := range decoded.Hits.Hits {
		docs = append(docs, mapCodeSymbolHit(hit.Source, hit.Score))
	}
	return docs, nil
}

func mapCodeSymbolHit(src map[string]interface{}, score float64) CodeSymbolDocument {
	return CodeSymbolDocument{
		ID:           fmt.Sprint(src["id"]),
		Type:         fmt.Sprint(src["type"]),
		RepoID:       fmt.Sprint(src["repoId"]),
		RepoName:     fmt.Sprint(src["repoName"]),
		RepoURL:      fmt.Sprint(src["repoUrl"]),
		FilePath:     fmt.Sprint(src["filePath"]),
		Language:     fmt.Sprint(src["language"]),
		PackageName:  fmt.Sprint(src["packageName"]),
		ClassName:    fmt.Sprint(src["className"]),
		MethodName:   fmt.Sprint(src["methodName"]),
		Symbol:       fmt.Sprint(src["symbol"]),
		SymbolKind:   fmt.Sprint(src["symbolKind"]),
		StartLine:    intFromAny(src["startLine"]),
		EndLine:      intFromAny(src["endLine"]),
		DocComment:   fmt.Sprint(src["docComment"]),
		QualifiedRef: fmt.Sprint(src["qualifiedRef"]),
		Snippet:      fmt.Sprint(src["snippet"]),
		Score:        score,
	}
}

func intFromAny(v interface{}) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	default:
		return 0
	}
}

func (c *Client) runSearch(ctx context.Context, body []byte) ([]SearchDocument, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/%s/_search", c.baseURL, c.index), bytes.NewReader(body))
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
		return nil, fmt.Errorf("opensearch status %d", resp.StatusCode)
	}

	var decoded struct {
		Hits struct {
			Hits []struct {
				Score  float64                `json:"_score"`
				Source map[string]interface{} `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return nil, err
	}

	docs := make([]SearchDocument, 0, len(decoded.Hits.Hits))
	for _, hit := range decoded.Hits.Hits {
		docs = append(docs, SearchDocument{
			ID:      fmt.Sprint(hit.Source["id"]),
			Type:    fmt.Sprint(hit.Source["type"]),
			Title:   fmt.Sprint(hit.Source["title"]),
			Snippet: fmt.Sprint(hit.Source["snippet"]),
			Ref:     fmt.Sprint(hit.Source["ref"]),
			RepoID:  fmt.Sprint(hit.Source["repoId"]),
			Score:   hit.Score,
		})
	}
	return docs, nil
}

func (c *Client) IndexDocument(ctx context.Context, doc SearchDocument) error {
	if !c.enabled || doc.ID == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]interface{}{
		"id": doc.ID, "type": doc.Type, "title": doc.Title,
		"snippet": doc.Snippet, "ref": doc.Ref, "repoId": doc.RepoID,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		fmt.Sprintf("%s/%s/_doc/%s", c.baseURL, c.index, doc.ID), bytes.NewReader(body))
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
		return fmt.Errorf("index doc: %s", string(raw))
	}
	return nil
}

func (c *Client) IndexCodeSymbol(ctx context.Context, doc CodeSymbolDocument) error {
	if !c.enabled || doc.ID == "" {
		return nil
	}
	payload := map[string]interface{}{
		"id": doc.ID, "type": doc.Type, "repoId": doc.RepoID,
		"repoName": doc.RepoName, "repoUrl": doc.RepoURL,
		"filePath": doc.FilePath, "language": doc.Language,
		"packageName": doc.PackageName, "className": doc.ClassName,
		"methodName": doc.MethodName, "symbol": doc.Symbol,
		"symbolKind": doc.SymbolKind, "startLine": doc.StartLine,
		"endLine": doc.EndLine, "docComment": doc.DocComment,
		"qualifiedRef": doc.QualifiedRef, "snippet": doc.Snippet,
		"title": doc.Symbol, "ref": doc.QualifiedRef,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut,
		fmt.Sprintf("%s/%s/_doc/%s", c.baseURL, c.index, doc.ID), bytes.NewReader(body))
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
		return fmt.Errorf("index code symbol: %s", string(raw))
	}
	return nil
}

func (c *Client) DeleteByRepoID(ctx context.Context, repoID string) error {
	if !c.enabled || repoID == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]interface{}{
		"query": map[string]interface{}{
			"bool": map[string]interface{}{
				"must": []map[string]interface{}{
					{"term": map[string]interface{}{"repoId": repoID}},
					{"term": map[string]interface{}{"type": "code_symbol"}},
				},
			},
		},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/%s/_delete_by_query", c.baseURL, c.index), bytes.NewReader(body))
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
		return fmt.Errorf("delete by repo: %s", string(raw))
	}
	return nil
}
