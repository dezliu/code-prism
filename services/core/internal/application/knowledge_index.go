package application

import (
	"context"
	"crypto/md5"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"strings"

	opensearchstore "github.com/lingprism/core/internal/infrastructure/opensearch"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

const knowledgeDocChunkSize = 800

func chunkKnowledgeText(text string, chunkSize int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if len(text) <= chunkSize {
		return []string{text}
	}

	paragraphs := strings.Split(text, "\n\n")
	chunks := make([]string, 0)
	current := strings.Builder{}

	flush := func() {
		if current.Len() == 0 {
			return
		}
		chunks = append(chunks, strings.TrimSpace(current.String()))
		current.Reset()
	}

	for _, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}
		if len(paragraph) > chunkSize {
			flush()
			for start := 0; start < len(paragraph); start += chunkSize {
				end := start + chunkSize
				if end > len(paragraph) {
					end = len(paragraph)
				}
				chunks = append(chunks, paragraph[start:end])
			}
			continue
		}
		if current.Len()+len(paragraph)+2 > chunkSize {
			flush()
		}
		if current.Len() > 0 {
			current.WriteString("\n\n")
		}
		current.WriteString(paragraph)
	}
	flush()
	return chunks
}

func knowledgeDocPointID(docID string, chunkIndex int) uint64 {
	sum := md5.Sum([]byte(fmt.Sprintf("%s:%d", docID, chunkIndex)))
	return binary.BigEndian.Uint64(sum[:8])
}

func buildKnowledgeDocPoints(docID, title, repoID string, chunks []string, dim int, vectors [][]float32) []map[string]interface{} {
	points := make([]map[string]interface{}, 0, len(chunks))
	for i, chunk := range chunks {
		vec := qdrantclient.HashEmbed(title+"\n"+chunk, dim)
		if i < len(vectors) && len(vectors[i]) > 0 {
			vec = vectors[i]
		}
		points = append(points, map[string]interface{}{
			"id":     knowledgeDocPointID(docID, i),
			"vector": vec,
			"payload": map[string]interface{}{
				"kind":    "knowledge_doc",
				"docId":   docID,
				"symbol":  title,
				"snippet": chunk,
				"repoId":  repoID,
			},
		})
	}
	return points
}

func (s *SearchService) IndexKnowledgeDoc(ctx context.Context, docID string) error {
	if s.db == nil {
		return fmt.Errorf("database unavailable")
	}
	if s.qdrant == nil {
		return nil
	}

	var title, content, status string
	var repoIDsJSON []byte
	err := s.db.DB().QueryRowContext(ctx, `
		SELECT i.title, i.content, i.status, b.repo_ids
		FROM knowledge_doc_items i
		JOIN knowledge_bases b ON b.id = i.knowledge_base_id
		WHERE i.id = ?
	`, docID).Scan(&title, &content, &status, &repoIDsJSON)
	if err != nil {
		return err
	}
	if status != "published" {
		return fmt.Errorf("knowledge doc is not published")
	}

	repoID := ""
	var repoIDs []string
	if len(repoIDsJSON) > 0 {
		_ = json.Unmarshal(repoIDsJSON, &repoIDs)
		if len(repoIDs) > 0 {
			repoID = repoIDs[0]
		}
	}

	// 先确保集合存在
	if err := s.qdrant.EnsureCollection(ctx); err != nil {
		return err
	}

	// 再删除旧索引
	if err := s.qdrant.DeleteByDocID(ctx, docID); err != nil {
		return err
	}

	chunks := chunkKnowledgeText(content, knowledgeDocChunkSize)
	if len(chunks) == 0 {
		chunks = []string{title}
	}

	if err := s.qdrant.EnsureCollection(ctx); err != nil {
		return err
	}

	vectors := make([][]float32, len(chunks))
	for i, chunk := range chunks {
		vectors[i] = s.embedQuery(ctx, title+"\n"+chunk)
	}

	points := buildKnowledgeDocPoints(docID, title, repoID, chunks, s.qdrantDim, vectors)
	if len(points) == 0 {
		return nil
	}
	if err := s.qdrant.UpsertPoints(ctx, points); err != nil {
		return err
	}

	if s.openSearch != nil && s.openSearch.Enabled() {
		for i, chunk := range chunks {
			_ = s.openSearch.IndexDocument(ctx, opensearchstore.SearchDocument{
				ID:      fmt.Sprintf("%s:%d", docID, i),
				Type:    "doc",
				Title:   title,
				Snippet: chunk,
				Ref:     docID,
				RepoID:  repoID,
			})
		}
	}
	return nil
}

func (s *SearchService) RemoveKnowledgeDoc(ctx context.Context, docID string) error {
	if docID == "" {
		return fmt.Errorf("docId required")
	}
	if s.qdrant == nil {
		return nil
	}
	return s.qdrant.DeleteByDocID(ctx, docID)
}
