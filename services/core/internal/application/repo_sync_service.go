package application

import (
	"context"
	"database/sql"
	"log"
	"time"

	gitclient "github.com/lingprism/core/internal/infrastructure/git"
	"github.com/lingprism/core/internal/infrastructure/mysql"
)

type RepoSyncService struct {
	db            *mysql.Client
	git           *gitclient.Client
	indexTrigger  IndexTrigger
}

// IndexTrigger 索引触发接口，避免循环依赖
type IndexTrigger interface {
	EnqueueIndex(ctx context.Context, repoID string) (EnqueueIndexResult, error)
}

func NewRepoSyncService(db *mysql.Client, git *gitclient.Client, indexTrigger IndexTrigger) *RepoSyncService {
	return &RepoSyncService{db: db, git: git, indexTrigger: indexTrigger}
}

type connectedRepo struct {
	ID              string
	URL             string
	DefaultBranch   string
	LocalHash       sql.NullString
	IndexedInSearch bool
}

func (s *RepoSyncService) PollOnce(ctx context.Context) {
	if s.db == nil || s.git == nil {
		return
	}

	rows, err := s.db.DB().QueryContext(ctx, `
		SELECT id, url, default_branch, local_commit_hash, indexed_in_search
		FROM repos
		WHERE connection_status = 'connected' AND enabled = true
	`)
	if err != nil {
		log.Printf(`{"level":"warn","msg":"repo sync poll query failed","error":%q}`, err.Error())
		return
	}
	defer rows.Close()

	repos := []connectedRepo{}
	for rows.Next() {
		var rec connectedRepo
		if scanErr := rows.Scan(&rec.ID, &rec.URL, &rec.DefaultBranch, &rec.LocalHash, &rec.IndexedInSearch); scanErr != nil {
			continue
		}
		repos = append(repos, rec)
	}

	for _, repo := range repos {
		s.syncRepo(ctx, repo)
	}
}

func (s *RepoSyncService) syncRepo(ctx context.Context, repo connectedRepo) {
	branch := repo.DefaultBranch
	if branch == "" {
		branch = "main"
	}

	remoteHash, err := s.git.HeadRemote(ctx, repo.URL, branch)
	if err != nil {
		errorMsg := err.Error()
		log.Printf(`{"level":"warn","msg":"repo sync head remote failed","repoId":%q,"error":%q}`, repo.ID, errorMsg)
		_, _ = s.db.DB().ExecContext(ctx, `
			UPDATE repos SET sync_status = 'failed', sync_error = ?, updated_at = NOW() WHERE id = ?
		`, errorMsg, repo.ID)
		return
	}

	localHash := ""
	if repo.LocalHash.Valid {
		localHash = repo.LocalHash.String
	}

	if localHash == remoteHash {
		_, _ = s.db.DB().ExecContext(ctx, `
			UPDATE repos SET remote_commit_hash = ?, sync_status = 'synced', updated_at = NOW() WHERE id = ?
		`, remoteHash, repo.ID)
		return
	}

	log.Printf(`{"level":"info","msg":"repo sync pull","repoId":%q,"oldHash":%q,"newHash":%q,"action":"pull"}`,
		repo.ID, localHash, remoteHash)

	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET sync_status = 'syncing', remote_commit_hash = ?, updated_at = NOW() WHERE id = ?
	`, remoteHash, repo.ID)

	syncResult, syncErr := s.git.Sync(ctx, repo.ID, repo.URL, branch)
	if syncErr != nil {
		errorMsg := syncErr.Error()
		log.Printf(`{"level":"warn","msg":"repo sync pull failed","repoId":%q,"error":%q}`, repo.ID, errorMsg)
		_, _ = s.db.DB().ExecContext(ctx, `
			UPDATE repos SET sync_status = 'failed', sync_error = ?, updated_at = NOW() WHERE id = ?
		`, errorMsg, repo.ID)
		return
	}

	syncStatus := "synced"
	var indexedHash sql.NullString
	_ = s.db.DB().QueryRowContext(ctx, `SELECT indexed_commit_hash FROM repos WHERE id = ?`, repo.ID).Scan(&indexedHash)
	if indexedHash.Valid && indexedHash.String != "" && indexedHash.String != remoteHash {
		syncStatus = "pending_update"
	}

	_, _ = s.db.DB().ExecContext(ctx, `
		UPDATE repos SET
			local_commit_hash = ?,
			remote_commit_hash = ?,
			last_commit_at = ?,
			last_commit_summary = ?,
			sync_status = ?,
			sync_error = NULL,
			last_synced_at = NOW(),
			updated_at = NOW()
		WHERE id = ?
	`, syncResult.HeadCommitHash, remoteHash, syncResult.LastCommitAt, syncResult.LastCommitSummary, syncStatus, repo.ID)

	// 自动触发增量索引：当仓库已纳入检索库且 commit 发生变化时
	if repo.IndexedInSearch && s.indexTrigger != nil && syncResult.HeadCommitHash != localHash {
		log.Printf(`{"level":"info","msg":"auto enqueue index after sync","repoId":%q}`, repo.ID)
		if _, err := s.indexTrigger.EnqueueIndex(ctx, repo.ID); err != nil {
			log.Printf(`{"level":"warn","msg":"auto enqueue index failed","repoId":%q,"error":%q}`, repo.ID, err.Error())
		}
	}
}

func StartRepoSyncWorker(ctx context.Context, svc *RepoSyncService, interval time.Duration) {
	if svc == nil || interval <= 0 {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		svc.PollOnce(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				svc.PollOnce(ctx)
			}
		}
	}()
}
