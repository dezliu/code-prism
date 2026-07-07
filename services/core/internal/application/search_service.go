package application

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/lingprism/core/internal/infrastructure/mysql"
	"github.com/lingprism/core/internal/infrastructure/embedding"
	opensearchstore "github.com/lingprism/core/internal/infrastructure/opensearch"
	neo4jstore "github.com/lingprism/core/internal/infrastructure/neo4j"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

type SearchService struct {
	db         *mysql.Client
	qdrant     *qdrantclient.Client
	qdrantDim  int
	embedder   *embedding.Client
	openSearch *opensearchstore.Client
	neo4j      *neo4jstore.Client
}

func NewSearchService(
	db *mysql.Client,
	qdrant *qdrantclient.Client,
	qdrantDim int,
	embedder *embedding.Client,
	openSearch *opensearchstore.Client,
	neo4j *neo4jstore.Client,
) *SearchService {
	return &SearchService{
		db: db, qdrant: qdrant, qdrantDim: qdrantDim,
		embedder: embedder, openSearch: openSearch, neo4j: neo4j,
	}
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

type HybridSearchInput struct {
	Query  string
	RepoIDs []string
	Intent string
	Mode   string
}

func (s *SearchService) embedQuery(ctx context.Context, query string) []float32 {
	if s.embedder != nil {
		vec, err := s.embedder.Embed(ctx, query)
		if err == nil && len(vec) > 0 {
			log.Printf(`{"level":"debug","msg":"embedder result","dim":%d,"model":%q}`, len(vec), s.embedder.ModelName())
			return vec
		}
	}
	vec := qdrantclient.HashEmbed(query, s.qdrantDim)
	log.Printf(`{"level":"debug","msg":"hash embed fallback","dim":%d}`, len(vec))
	return vec
}

func (s *SearchService) Search(ctx context.Context, query string, repoIDs []string) (SearchResult, error) {
	return s.HybridSearch(ctx, HybridSearchInput{Query: query, RepoIDs: repoIDs, Intent: "general"})
}

func (s *SearchService) HybridSearch(ctx context.Context, input HybridSearchInput) (SearchResult, error) {
	q := strings.TrimSpace(input.Query)
	if q == "" {
		return SearchResult{Hits: []SearchHit{}}, nil
	}

	intent := input.Intent
	if intent == "" {
		intent = "general"
	}
	mode := input.Mode

	vectorHits, _ := s.vectorSearch(ctx, q, input.RepoIDs, intent, mode)
	bm25Hits, _ := s.bm25Search(ctx, q, input.RepoIDs)
	sqlHits, _ := s.mysqlDocSearch(ctx, q)
	repoHits, _ := s.repoMetadataSearch(ctx, q, input.RepoIDs)

	lists := [][]SearchHit{vectorHits, bm25Hits, sqlHits}
	if intent == "architecture" || intent == "general" {
		lists = append(lists, repoHits)
	}

	hits := ReciprocalRankFusion(lists, 60)
	if len(hits) == 0 {
		hits = append(hits, SearchHit{
			Type: "code", Title: "代码检索结果",
			Snippet: fmt.Sprintf("未找到精确匹配，建议缩小问题范围后重试。查询：%s", q),
		})
	}
	if len(hits) > 12 {
		hits = hits[:12]
	}
	return SearchResult{Hits: hits}, nil
}

func (s *SearchService) vectorSearch(ctx context.Context, q string, repoIDs []string, intent, mode string) ([]SearchHit, error) {
	if s.qdrant == nil {
		return nil, nil
	}
	vec := s.embedQuery(ctx, q)
	qdrantHits, err := s.qdrant.Search(ctx, vec, 10)
	if err != nil {
		return nil, err
	}

	indexedRepoIDs := s.loadIndexedRepoIDs(ctx)
	hits := []SearchHit{}
	for _, hit := range qdrantHits {
		if hit.Payload.Kind == "knowledge_doc" {
			if intent == "code" && mode == "code" {
				continue
			}
			if len(repoIDs) > 0 && hit.Payload.RepoID != "" && !contains(repoIDs, hit.Payload.RepoID) {
				continue
			}
			hits = append(hits, SearchHit{
				Type: "doc", Title: hit.Payload.Symbol,
				Snippet: hit.Payload.Snippet, Ref: hit.Payload.DocID, Score: hit.Score,
			})
			continue
		}
		if intent == "doc" && hit.Payload.Kind != "knowledge_doc" {
			// code hit in doc-only intent — still include with lower priority via score
		}
		if len(repoIDs) > 0 {
			if !contains(repoIDs, hit.Payload.RepoID) {
				continue
			}
		} else if len(indexedRepoIDs) > 0 && !contains(indexedRepoIDs, hit.Payload.RepoID) {
			continue
		}
		if mode == "code" || intent == "code" {
			hits = append(hits, SearchHit{
				Type: "code", Title: hit.Payload.Symbol,
				Snippet: hit.Payload.Snippet, Ref: hit.Payload.FilePath, Score: hit.Score,
			})
		} else if intent != "doc" {
			hits = append(hits, SearchHit{
				Type: "code", Title: hit.Payload.Symbol,
				Snippet: hit.Payload.Snippet, Ref: hit.Payload.FilePath, Score: hit.Score,
			})
		}
	}
	return hits, nil
}

func (s *SearchService) bm25Search(ctx context.Context, q string, repoIDs []string) ([]SearchHit, error) {
	if s.openSearch == nil || !s.openSearch.Enabled() {
		return nil, nil
	}
	docs, err := s.openSearch.Search(ctx, q, repoIDs, 8)
	if err != nil {
		return nil, err
	}
	hits := make([]SearchHit, 0, len(docs))
	for _, doc := range docs {
		hits = append(hits, SearchHit{
			Type: doc.Type, Title: doc.Title, Snippet: doc.Snippet,
			Ref: doc.Ref, Score: doc.Score,
		})
	}
	return hits, nil
}

func (s *SearchService) mysqlDocSearch(ctx context.Context, q string) ([]SearchHit, error) {
	if s.db == nil {
		return nil, nil
	}

	keywords := extractSearchKeywords(q)
	if len(keywords) == 0 {
		keywords = []string{strings.TrimSpace(q)}
	}

	conditions := make([]string, 0, len(keywords))
	args := make([]interface{}, 0, len(keywords)*2)
	for _, kw := range keywords {
		if kw == "" {
			continue
		}
		conditions = append(conditions, "(i.title LIKE ? OR i.content LIKE ?)")
		pattern := "%" + kw + "%"
		args = append(args, pattern, pattern)
	}
	if len(conditions) == 0 {
		return nil, nil
	}

	sql := fmt.Sprintf(`
		SELECT i.id, i.title, i.content
		FROM knowledge_doc_items i
		WHERE i.status = 'published' AND i.indexed_in_search = true
		  AND (%s)
		LIMIT 8
	`, strings.Join(conditions, " OR "))

	rows, err := s.db.DB().QueryContext(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type docRow struct {
		id, title, content string
	}
	rowsData := []docRow{}
	for rows.Next() {
		var id, title, content string
		if err := rows.Scan(&id, &title, &content); err == nil {
			rowsData = append(rowsData, docRow{id, title, content})
		}
	}

	hits := make([]SearchHit, 0, len(rowsData))
	for _, row := range rowsData {
		matchCount := 0
		combined := row.title + " " + row.content
		for _, kw := range keywords {
			if strings.Contains(combined, kw) {
				matchCount++
			}
		}
		score := 0.3 + float64(matchCount)*0.1
		if score > 0.9 {
			score = 0.9
		}
		snippet := row.content
		if len(snippet) > 120 {
			snippet = snippet[:120] + "…"
		}
		hits = append(hits, SearchHit{
			Type: "doc", Title: row.title, Snippet: snippet, Ref: row.id, Score: score,
		})
	}
	return hits, nil
}

func (s *SearchService) repoMetadataSearch(ctx context.Context, q string, repoIDs []string) ([]SearchHit, error) {
	if s.db == nil || len(repoIDs) == 0 {
		return nil, nil
	}
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
	if err != nil {
		return nil, err
	}
	defer repoRows.Close()
	hits := []SearchHit{}
	for repoRows.Next() {
		var id, name string
		if err := repoRows.Scan(&id, &name); err == nil {
			hits = append(hits, SearchHit{
				Type: "repo", Title: name,
				Snippet: fmt.Sprintf("代码仓库 %s 中与「%s」相关的索引片段", name, q),
				Ref: id, Score: 0.3,
			})
		}
	}
	return hits, nil
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

func (s *SearchService) IndexOpenSearchDoc(ctx context.Context, doc opensearchstore.SearchDocument) error {
	if s.openSearch == nil {
		return nil
	}
	return s.openSearch.IndexDocument(ctx, doc)
}
