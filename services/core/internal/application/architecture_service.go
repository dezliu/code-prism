package application

import (
	"context"
	"fmt"

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

// GenerateDraft is deprecated — architecture drafts are created by services/api orchestrator.
func (s *ArchitectureService) GenerateDraft(ctx context.Context, repoID string) (GenerateDraftResult, error) {
	_ = ctx
	_ = repoID
	return GenerateDraftResult{}, fmt.Errorf(
		"generate-draft is deprecated; use API /api/architecture/generate/stream or enqueueArchGenerateJob",
	)
}
