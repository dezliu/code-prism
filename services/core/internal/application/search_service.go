package application

import (
	"context"
	"fmt"
	"strings"

	"github.com/lingprism/core/internal/infrastructure/mysql"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

type SearchService struct {
	db       *mysql.Client
	qdrant   *qdrantclient.Client
	qdrantDim int
}

func NewSearchService(db *mysql.Client, qdrant *qdrantclient.Client, qdrantDim int) *SearchService {
	return &SearchService{db: db, qdrant: qdrant, qdrantDim: qdrantDim}
}

type SearchHit struct {
	Type    string  `json:"type"`
	Title   string  `json:"title"`
	Snippet string  `json:"snippet"`
	Ref     string  `json:"ref,omitempty"`
	Score   float64 `json:"score,omitempty"`
}

type SearchResult struct {
	Hits []SearchHit `json:"hits"`
}

func (s *SearchService) Search(ctx context.Context, query string, repoIDs []string) (SearchResult, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return SearchResult{Hits: []SearchHit{}}, nil
	}

	hits := []SearchHit{}
	indexedRepoIDs := s.loadIndexedRepoIDs(ctx)

	if s.qdrant != nil {
		vec := qdrantclient.HashEmbed(q, s.qdrantDim)
		qdrantHits, err := s.qdrant.Search(ctx, vec, 8)
		if err == nil {
			for _, hit := range qdrantHits {
				if hit.Payload.Kind == "knowledge_doc" {
					if len(repoIDs) > 0 && hit.Payload.RepoID != "" && !contains(repoIDs, hit.Payload.RepoID) {
						continue
					}
					hits = append(hits, SearchHit{
						Type:    "doc",
						Title:   hit.Payload.Symbol,
						Snippet: hit.Payload.Snippet,
						Ref:     hit.Payload.DocID,
						Score:   hit.Score,
					})
					continue
				}
				if len(repoIDs) > 0 {
					if !contains(repoIDs, hit.Payload.RepoID) {
						continue
					}
				} else if len(indexedRepoIDs) > 0 && !contains(indexedRepoIDs, hit.Payload.RepoID) {
					continue
				}
				hits = append(hits, SearchHit{
					Type:    "code",
					Title:   hit.Payload.Symbol,
					Snippet: hit.Payload.Snippet,
					Ref:     hit.Payload.FilePath,
					Score:   hit.Score,
				})
			}
		}
	}

	rows, err := s.db.DB().QueryContext(ctx, `
		SELECT i.id, i.title, i.content
		FROM knowledge_doc_items i
		WHERE i.status = 'published' AND i.indexed_in_search = true
		  AND (i.title LIKE ? OR i.content LIKE ?)
		LIMIT 5
	`, "%"+q+"%", "%"+q+"%")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, title, content string
			if err := rows.Scan(&id, &title, &content); err == nil {
				snippet := content
				if len(snippet) > 120 {
					snippet = snippet[:120] + "…"
				}
				hits = append(hits, SearchHit{
					Type: "doc", Title: title, Snippet: snippet, Ref: id,
				})
			}
		}
	}

	if len(repoIDs) > 0 {
		placeholders := strings.Repeat("?,", len(repoIDs))
		placeholders = placeholders[:len(placeholders)-1]
		args := make([]interface{}, len(repoIDs))
		for i, id := range repoIDs {
			args[i] = id
		}
		sql := fmt.Sprintf(`
			SELECT r.id, COALESCE(m.display_name, r.name) AS name
			FROM repos r
			LEFT JOIN repo_metadata m ON m.repo_id = r.id
			WHERE r.id IN (%s) AND r.indexed_in_search = true
		`, placeholders)
		repoRows, err := s.db.DB().QueryContext(ctx, sql, args...)
		if err == nil {
			defer repoRows.Close()
			for repoRows.Next() {
				var id, name string
				if err := repoRows.Scan(&id, &name); err == nil {
					hits = append(hits, SearchHit{
						Type: "repo", Title: name,
						Snippet: fmt.Sprintf("代码仓库 %s 中与「%s」相关的索引片段", name, q),
						Ref: id,
					})
				}
			}
		}
	}

	if len(hits) == 0 {
		hits = append(hits, SearchHit{
			Type: "code", Title: "代码检索结果",
			Snippet: fmt.Sprintf("未找到精确匹配，建议缩小问题范围后重试。查询：%s", q),
		})
	}

	return SearchResult{Hits: hits}, nil
}

func (s *SearchService) loadIndexedRepoIDs(ctx context.Context) []string {
	if s.db == nil {
		return nil
	}
	rows, err := s.db.DB().QueryContext(ctx, `
		SELECT id FROM repos WHERE indexed_in_search = true
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func contains(list []string, target string) bool {
	for _, item := range list {
		if item == target {
			return true
		}
	}
	return false
}
