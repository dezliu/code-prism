package application

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/lingprism/core/internal/infrastructure/mysql"
)

type ArchitectureService struct {
	db *mysql.Client
}

func NewArchitectureService(db *mysql.Client) *ArchitectureService {
	return &ArchitectureService{db: db}
}

type GenerateDraftResult struct {
	SnapshotID string `json:"snapshotId"`
}

func (s *ArchitectureService) GenerateDraft(ctx context.Context, repoID string) (GenerateDraftResult, error) {
	var exists int
	err := s.db.DB().QueryRowContext(ctx, `SELECT COUNT(1) FROM repos WHERE id = ?`, repoID).Scan(&exists)
	if err != nil || exists == 0 {
		return GenerateDraftResult{}, fmt.Errorf("repo not found: %s", repoID)
	}

	graph := defaultGraphData(repoID)
	graphJSON, err := json.Marshal(graph)
	if err != nil {
		return GenerateDraftResult{}, err
	}

	snapshotID := uuid.NewString()
	_, err = s.db.DB().ExecContext(ctx, `
		INSERT INTO graph_snapshots (id, repo_id, version, is_official, graph_data, created_at)
		VALUES (?, ?, 1, false, ?, NOW())
	`, snapshotID, repoID, string(graphJSON))
	if err != nil {
		return GenerateDraftResult{}, fmt.Errorf("insert graph snapshot: %w", err)
	}

	return GenerateDraftResult{SnapshotID: snapshotID}, nil
}
