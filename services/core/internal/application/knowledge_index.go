package application

import (
	"context"
	"crypto/md5"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"strings"

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

func buildKnowledgeDocPoints(docID, title, repoID string, chunks []string, dim int) []map[string]interface{} {
	points := make([]map[string]interface{}, 0, len(chunks))
	for i, chunk := range chunks {
		embedText := title + "\n" + chunk
		points = append(points, map[string]interface{}{
			"id":     knowledgeDocPointID(docID, i),
			"vector": qdrantclient.HashEmbed(embedText, dim),
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
		SELECT title, content, status, repo_ids FROM knowledge_docs WHERE id = ?
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

	points := buildKnowledgeDocPoints(docID, title, repoID, chunks, s.qdrantDim)
	if len(points) == 0 {
		return nil
	}
	return s.qdrant.UpsertPoints(ctx, points)
}
