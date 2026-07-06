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
				"type":    map[string]string{"type": "keyword"},
				"title":   map[string]string{"type": "text"},
				"snippet": map[string]string{"type": "text"},
				"ref":     map[string]string{"type": "keyword"},
				"repoId":  map[string]string{"type": "keyword"},
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
							"fields": []string{"title^2", "snippet"},
						},
					},
				},
				"filter": filters,
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
