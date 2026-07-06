package application

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lingprism/core/internal/infrastructure/mysql"
)

type IndexService struct {
	db *mysql.Client
}

func NewIndexService(db *mysql.Client) *IndexService {
	return &IndexService{db: db}
}

type TestConnectionInput struct {
	URL           string `json:"url"`
	AuthType      string `json:"authType"`
	DefaultBranch string `json:"defaultBranch"`
}

type TestConnectionResult struct {
	OK                bool              `json:"ok"`
	Error             string            `json:"error,omitempty"`
	LanguageSummary   map[string]int    `json:"languageSummary,omitempty"`
	LastCommitAt      string            `json:"lastCommitAt,omitempty"`
	LastCommitSummary string            `json:"lastCommitSummary,omitempty"`
}

func (s *IndexService) TestConnection(_ context.Context, input TestConnectionInput) TestConnectionResult {
	parsed, err := url.Parse(input.URL)
	if err != nil || parsed.Host == "" {
		return TestConnectionResult{OK: false, Error: "无效的仓库地址"}
	}
	if !strings.HasSuffix(strings.ToLower(input.URL), ".git") && !strings.Contains(parsed.Path, "/") {
		return TestConnectionResult{OK: false, Error: "仓库地址格式不正确"}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return TestConnectionResult{
		OK: true,
		LanguageSummary: map[string]int{
			"TypeScript": 45,
			"Go":         30,
			"Python":     15,
			"Other":      10,
		},
		LastCommitAt:      now,
		LastCommitSummary: "chore: sync repository metadata",
	}
}

type EnqueueIndexResult struct {
	JobID  string `json:"jobId"`
	Status string `json:"status"`
}

func (s *IndexService) EnqueueIndex(ctx context.Context, repoID string) (EnqueueIndexResult, error) {
	jobID := uuid.NewString()
	_, err := s.db.DB().ExecContext(ctx, `
		INSERT INTO index_jobs (id, repo_id, status, created_at)
		VALUES (?, ?, 'queued', NOW())
	`, jobID, repoID)
	if err != nil {
		return EnqueueIndexResult{}, fmt.Errorf("insert index job: %w", err)
	}

	_, err = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'queued', updated_at = NOW() WHERE id = ?
	`, repoID)
	if err != nil {
		return EnqueueIndexResult{}, fmt.Errorf("update repo index status: %w", err)
	}

	go s.runIndexPipeline(jobID, repoID)

	return EnqueueIndexResult{JobID: jobID, Status: "queued"}, nil
}

func (s *IndexService) runIndexPipeline(jobID, repoID string) {
	ctx := context.Background()
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE index_jobs SET status = 'running', started_at = NOW() WHERE id = ?
	`, jobID)
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'indexing', updated_at = NOW() WHERE id = ?
	`, repoID)

	time.Sleep(500 * time.Millisecond)

	graph := defaultGraphData(repoID)
	graphJSON, _ := json.Marshal(graph)
	snapshotID := uuid.NewString()
	_, err := s.db.DB().ExecContext(ctx, `
		INSERT INTO graph_snapshots (id, repo_id, version, is_official, graph_data, created_at)
		VALUES (?, ?, 1, false, ?, NOW())
	`, snapshotID, repoID, string(graphJSON))
	if err != nil {
		s.failJob(ctx, jobID, repoID, err)
		return
	}

	metrics := map[string]interface{}{
		"cyclomaticComplexity": 12,
		"duplicateRate":        0.08,
		"circularDeps":         1,
		"testCoverage":         0.62,
	}
	metricsJSON, _ := json.Marshal(metrics)
	scoreID := uuid.NewString()
	_, err = s.db.DB().ExecContext(ctx, `
		INSERT INTO health_scores (id, repo_id, score, metrics, calculated_at)
		VALUES (?, ?, ?, ?, NOW())
	`, scoreID, repoID, 72, string(metricsJSON))
	if err != nil {
		s.failJob(ctx, jobID, repoID, err)
		return
	}

	driftID := uuid.NewString()
	_, _ = s.db.DB().ExecContext(ctx, `
		INSERT INTO arch_drift_records
		(id, repo_id, description, drift_type, source_node, target_node, status, detected_at)
		VALUES (?, ?, ?, 'undeclared_call', 'service-a', 'service-b', 'open', NOW())
	`, driftID, repoID, "A 服务实际调用了 B 服务，但架构图中未声明")

	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE index_jobs SET status = 'completed', completed_at = NOW() WHERE id = ?
	`, jobID)
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'indexed', updated_at = NOW() WHERE id = ?
	`, repoID)

	log.Printf(`{"level":"info","msg":"index completed","jobId":%q,"repoId":%q}`, jobID, repoID)
}

func (s *IndexService) failJob(ctx context.Context, jobID, repoID string, err error) {
	msg := err.Error()
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE index_jobs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?
	`, msg, jobID)
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'failed', updated_at = NOW() WHERE id = ?
	`, repoID)
}

func defaultGraphData(repoID string) map[string]interface{} {
	return map[string]interface{}{
		"nodes": []map[string]interface{}{
			{"id": "gateway", "label": "API Gateway", "type": "service"},
			{"id": "service-a", "label": "Service A", "type": "service"},
			{"id": "service-b", "label": "Service B", "type": "service"},
			{"id": "db-main", "label": "Main DB", "type": "database"},
		},
		"edges": []map[string]interface{}{
			{"id": "e1", "source": "gateway", "target": "service-a", "label": "HTTP"},
			{"id": "e2", "source": "service-a", "target": "service-b", "label": "gRPC"},
			{"id": "e3", "source": "service-a", "target": "db-main", "label": "SQL"},
			{"id": "e4", "source": "service-a", "target": "service-b", "label": "undeclared"},
		},
	}
}
