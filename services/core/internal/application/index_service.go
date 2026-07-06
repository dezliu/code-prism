package application

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	gitclient "github.com/lingprism/core/internal/infrastructure/git"
	idxclient "github.com/lingprism/core/internal/infrastructure/indexer"
	neo4jstore "github.com/lingprism/core/internal/infrastructure/neo4j"
	"github.com/lingprism/core/internal/infrastructure/mysql"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

type IndexService struct {
	db             *mysql.Client
	git            *gitclient.Client
	indexer        *idxclient.Client
	neo4j          *neo4jstore.Client
	qdrant         *qdrantclient.Client
	qdrantDim      int
}

type IndexServiceDeps struct {
	Git       *gitclient.Client
	Indexer   *idxclient.Client
	Neo4j     *neo4jstore.Client
	Qdrant    *qdrantclient.Client
	QdrantDim int
}

func NewIndexService(db *mysql.Client, deps IndexServiceDeps) *IndexService {
	return &IndexService{
		db:        db,
		git:       deps.Git,
		indexer:   deps.Indexer,
		neo4j:     deps.Neo4j,
		qdrant:    deps.Qdrant,
		qdrantDim: deps.QdrantDim,
	}
}

type TestConnectionInput struct {
	URL           string `json:"url"`
	AuthType      string `json:"authType"`
	DefaultBranch string `json:"defaultBranch"`
}

type TestConnectionResult struct {
	OK                bool           `json:"ok"`
	Error             string         `json:"error,omitempty"`
	LanguageSummary   map[string]int `json:"languageSummary,omitempty"`
	LastCommitAt      string         `json:"lastCommitAt,omitempty"`
	LastCommitSummary string         `json:"lastCommitSummary,omitempty"`
}

func (s *IndexService) TestConnection(ctx context.Context, input TestConnectionInput) TestConnectionResult {
	parsed, err := url.Parse(input.URL)
	if err != nil || parsed.Host == "" {
		return TestConnectionResult{OK: false, Error: "无效的仓库地址"}
	}
	if !strings.HasSuffix(strings.ToLower(input.URL), ".git") && !strings.Contains(parsed.Path, "/") {
		return TestConnectionResult{OK: false, Error: "仓库地址格式不正确"}
	}

	if s.git == nil {
		now := time.Now().UTC().Format(time.RFC3339)
		return TestConnectionResult{
			OK: true,
			LanguageSummary: map[string]int{"TypeScript": 45, "Go": 30, "Python": 15, "Other": 10},
			LastCommitAt: now, LastCommitSummary: "chore: sync repository metadata",
		}
	}

	branch := input.DefaultBranch
	if branch == "" {
		branch = "main"
	}
	clone, err := s.git.Clone(ctx, input.URL, branch)
	if err != nil {
		return TestConnectionResult{OK: false, Error: err.Error()}
	}
	defer os.RemoveAll(clone.Path)

	return TestConnectionResult{
		OK:                true,
		LanguageSummary:   clone.LanguageSummary,
		LastCommitAt:      clone.LastCommitAt.UTC().Format(time.RFC3339),
		LastCommitSummary: clone.LastCommitSummary,
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

type RemoveIndexResult struct {
	RepoID  string `json:"repoId"`
	Removed bool   `json:"removed"`
}

func (s *IndexService) RemoveFromIndex(ctx context.Context, repoID string) (RemoveIndexResult, error) {
	if repoID == "" {
		return RemoveIndexResult{}, fmt.Errorf("repoId required")
	}

	if s.qdrant != nil {
		if err := s.qdrant.DeleteByRepoID(ctx, repoID); err != nil {
			return RemoveIndexResult{}, fmt.Errorf("delete qdrant points: %w", err)
		}
	}

	if s.neo4j != nil {
		if err := s.neo4j.DeleteRepoGraph(ctx, repoID); err != nil {
			log.Printf(`{"level":"warn","msg":"neo4j delete failed","repoId":%q,"error":%q}`, repoID, err.Error())
		}
	}

	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'removed', updated_at = NOW() WHERE id = ?
	`, repoID)

	log.Printf(`{"level":"info","msg":"index removed","repoId":%q}`, repoID)
	return RemoveIndexResult{RepoID: repoID, Removed: true}, nil
}

type repoRecord struct {
	ID            string
	URL           string
	DefaultBranch string
}

func (s *IndexService) loadRepo(ctx context.Context, repoID string) (repoRecord, error) {
	var rec repoRecord
	err := s.db.DB().QueryRowContext(ctx, `
		SELECT id, url, default_branch FROM repos WHERE id = ?
	`, repoID).Scan(&rec.ID, &rec.URL, &rec.DefaultBranch)
	return rec, err
}

func (s *IndexService) runIndexPipeline(jobID, repoID string) {
	ctx := context.Background()
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE index_jobs SET status = 'running', started_at = NOW() WHERE id = ?
	`, jobID)
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'indexing', updated_at = NOW() WHERE id = ?
	`, repoID)

	repo, err := s.loadRepo(ctx, repoID)
	if err != nil {
		s.failJob(ctx, jobID, repoID, err)
		return
	}

	var graph map[string]interface{}
	var langSummary map[string]int
	var lastCommitAt time.Time
	var lastCommitSummary string
	var headCommitHash string

	if s.git != nil && s.indexer != nil {
		syncResult, syncErr := s.git.Sync(ctx, repoID, repo.URL, repo.DefaultBranch)
		if syncErr != nil {
			s.failJob(ctx, jobID, repoID, syncErr)
			return
		}

		langSummary = syncResult.LanguageSummary
		lastCommitAt = syncResult.LastCommitAt
		lastCommitSummary = syncResult.LastCommitSummary
		headCommitHash = syncResult.HeadCommitHash

		outputs, idxErr := s.indexer.IndexDirectory(ctx, syncResult.Path)
		if idxErr != nil {
			s.failJob(ctx, jobID, repoID, idxErr)
			return
		}
		graph = idxclient.BuildGraphFromOutputs(outputs, repoID)

		if s.qdrant != nil {
			_ = s.qdrant.EnsureCollection(ctx)
			points := buildQdrantPoints(outputs, repoID, syncResult.Path, s.qdrantDim)
			if upsertErr := s.qdrant.UpsertPoints(ctx, points); upsertErr != nil {
				log.Printf(`{"level":"warn","msg":"qdrant upsert failed","error":%q}`, upsertErr.Error())
			}
		}

		if s.neo4j != nil {
			if neoErr := s.neo4j.UpsertRepoGraph(ctx, repoID, graph); neoErr != nil {
				log.Printf(`{"level":"warn","msg":"neo4j upsert failed","error":%q}`, neoErr.Error())
			}
		}
	} else {
		graph = defaultGraphData(repoID)
		langSummary = map[string]int{"Go": 30, "TypeScript": 45}
		lastCommitAt = time.Now().UTC()
		lastCommitSummary = "mock index"
	}

	langJSON, _ := json.Marshal(langSummary)
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET language_summary = ?, last_commit_at = ?, last_commit_summary = ?, updated_at = NOW()
		WHERE id = ?
	`, string(langJSON), lastCommitAt, lastCommitSummary, repoID)

	graphJSON, _ := json.Marshal(graph)
	snapshotID := uuid.NewString()
	_, err = s.db.DB().ExecContext(ctx, `
		INSERT INTO graph_snapshots (id, repo_id, version, is_official, graph_data, created_at)
		VALUES (?, ?, 1, false, ?, NOW())
	`, snapshotID, repoID, string(graphJSON))
	if err != nil {
		s.failJob(ctx, jobID, repoID, err)
		return
	}

	metrics := computeHealthMetrics(graph)
	metricsJSON, _ := json.Marshal(metrics)
	score := computeHealthScore(metrics)
	scoreID := uuid.NewString()
	_, err = s.db.DB().ExecContext(ctx, `
		INSERT INTO health_scores (id, repo_id, score, metrics, calculated_at)
		VALUES (?, ?, ?, ?, NOW())
	`, scoreID, repoID, score, string(metricsJSON))
	if err != nil {
		s.failJob(ctx, jobID, repoID, err)
		return
	}

	driftRecords := detectDrifts(graph, repoID)
	for _, drift := range driftRecords {
		driftID := uuid.NewString()
		_, _ = s.db.DB().ExecContext(ctx, `
			INSERT INTO arch_drift_records
			(id, repo_id, description, drift_type, source_node, target_node, status, detected_at)
			VALUES (?, ?, ?, ?, ?, ?, 'open', NOW())
		`, driftID, repoID, drift.description, drift.driftType, drift.source, drift.target)
	}

	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE index_jobs SET status = 'completed', completed_at = NOW() WHERE id = ?
	`, jobID)
	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET index_status = 'indexed', updated_at = NOW() WHERE id = ?
	`, repoID)

	if headCommitHash != "" {
		_, _ = s.db.DB().ExecContext(ctx, `
			UPDATE repos SET
				local_commit_hash = ?,
				remote_commit_hash = ?,
				indexed_commit_hash = ?,
				sync_status = 'synced',
				last_synced_at = NOW(),
				updated_at = NOW()
			WHERE id = ?
		`, headCommitHash, headCommitHash, headCommitHash, repoID)
	}

	log.Printf(`{"level":"info","msg":"index completed","jobId":%q,"repoId":%q}`, jobID, repoID)
}

type driftRecord struct {
	description string
	driftType   string
	source      string
	target      string
}

func detectDrifts(graph map[string]interface{}, _ string) []driftRecord {
	records := []driftRecord{}
	edges, _ := graph["edges"].([]map[string]interface{})
	for _, edge := range edges {
		label, _ := edge["label"].(string)
		if label == "undeclared" {
			records = append(records, driftRecord{
				description: fmt.Sprintf("%s 存在未声明依赖 %s", edge["source"], edge["target"]),
				driftType:   "undeclared_call",
				source:      fmt.Sprint(edge["source"]),
				target:      fmt.Sprint(edge["target"]),
			})
		}
	}
	if len(records) == 0 {
		records = append(records, driftRecord{
			description: "索引完成，未检测到架构漂移",
			driftType:   "none",
			source:      "n/a",
			target:      "n/a",
		})
	}
	return records
}

func computeHealthMetrics(graph map[string]interface{}) map[string]interface{} {
	nodes, _ := graph["nodes"].([]map[string]interface{})
	edges, _ := graph["edges"].([]map[string]interface{})
	return map[string]interface{}{
		"nodeCount":            len(nodes),
		"edgeCount":            len(edges),
		"cyclomaticComplexity": max(8, len(edges)/2),
		"duplicateRate":        0.05,
		"circularDeps":         0,
		"testCoverage":         0.65,
	}
}

func computeHealthScore(metrics map[string]interface{}) int {
	base := 80
	if cc, ok := metrics["cyclomaticComplexity"].(int); ok && cc > 20 {
		base -= 10
	}
	return base
}

func buildQdrantPoints(outputs []idxclient.IndexerOutput, repoID, root string, dim int) []map[string]interface{} {
	points := []map[string]interface{}{}
	idx := 0
	for _, out := range outputs {
		for _, sym := range out.Parse.Symbols {
			snippet := fmt.Sprintf("%s %s", sym.Kind, sym.Name)
			vec := qdrantclient.HashEmbed(snippet, dim)
			points = append(points, map[string]interface{}{
				"id":     idx,
				"vector": vec,
				"payload": map[string]interface{}{
					"repoId": repoID, "symbol": sym.Name, "kind": sym.Kind,
					"filePath": root, "snippet": snippet,
				},
			})
			idx++
		}
	}
	return points
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
			{"id": repoID, "label": "Repository", "type": "module"},
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

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
