package git

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type CloneResult struct {
	Path              string
	DefaultBranch     string
	LastCommitAt      time.Time
	LastCommitSummary string
	LanguageSummary   map[string]int
}

type SyncResult struct {
	Path              string
	DefaultBranch     string
	HeadCommitHash    string
	LastCommitAt      time.Time
	LastCommitSummary string
	LanguageSummary   map[string]int
}

type Client struct {
	workDir string
}

func NewClient(workDir string) *Client {
	return &Client{workDir: workDir}
}

func (c *Client) LocalPath(repoID string) string {
	return filepath.Join(c.workDir, repoID)
}

func (c *Client) Clone(ctx context.Context, repoURL, branch string) (CloneResult, error) {
	if branch == "" {
		branch = "main"
	}
	if err := os.MkdirAll(c.workDir, 0o755); err != nil {
		return CloneResult{}, fmt.Errorf("mkdir workdir: %w", err)
	}

	target := filepath.Join(c.workDir, fmt.Sprintf("repo-%d", time.Now().UnixNano()))
	if err := c.runClone(ctx, repoURL, branch, target); err != nil {
		return CloneResult{}, err
	}

	_, lastAt, summary := c.readHead(ctx, target)
	langSummary := detectLanguages(target)
	return CloneResult{
		Path:              target,
		DefaultBranch:     branch,
		LastCommitAt:      lastAt,
		LastCommitSummary: summary,
		LanguageSummary:   langSummary,
	}, nil
}

func (c *Client) Sync(ctx context.Context, repoID, repoURL, branch string) (SyncResult, error) {
	if branch == "" {
		branch = "main"
	}
	if repoID == "" {
		return SyncResult{}, fmt.Errorf("repoID required")
	}
	if err := os.MkdirAll(c.workDir, 0o755); err != nil {
		return SyncResult{}, fmt.Errorf("mkdir workdir: %w", err)
	}

	target := c.LocalPath(repoID)
	if _, err := os.Stat(filepath.Join(target, ".git")); os.IsNotExist(err) {
		if err := c.runClone(ctx, repoURL, branch, target); err != nil {
			return SyncResult{}, err
		}
	} else if err != nil {
		return SyncResult{}, fmt.Errorf("stat local mirror: %w", err)
	} else {
		if err := c.pullMirror(ctx, target, branch); err != nil {
			return SyncResult{}, err
		}
	}

	headHash, lastAt, summary := c.readHead(ctx, target)
	langSummary := detectLanguages(target)
	return SyncResult{
		Path:              target,
		DefaultBranch:     branch,
		HeadCommitHash:    headHash,
		LastCommitAt:      lastAt,
		LastCommitSummary: summary,
		LanguageSummary:   langSummary,
	}, nil
}

func (c *Client) HeadRemote(ctx context.Context, repoURL, branch string) (string, error) {
	if branch == "" {
		branch = "main"
	}
	ref := fmt.Sprintf("refs/heads/%s", branch)
	output, err := exec.CommandContext(ctx, "git", "ls-remote", repoURL, ref).CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git ls-remote: %w: %s", err, strings.TrimSpace(string(output)))
	}
	line := strings.TrimSpace(string(output))
	if line == "" {
		return "", fmt.Errorf("remote branch %s not found", branch)
	}
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return "", fmt.Errorf("unexpected ls-remote output")
	}
	return fields[0], nil
}

func (c *Client) runClone(ctx context.Context, repoURL, branch, target string) error {
	args := []string{"clone", "--depth", "1", "--branch", branch, repoURL, target}
	cmd := exec.CommandContext(ctx, "git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		args = []string{"clone", "--depth", "1", repoURL, target}
		cmd = exec.CommandContext(ctx, "git", args...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("git clone: %w: %s", err, strings.TrimSpace(string(output)))
		}
	}
	return nil
}

func (c *Client) pullMirror(ctx context.Context, target, branch string) error {
	fetchOut, fetchErr := exec.CommandContext(ctx, "git", "-C", target, "fetch", "origin", branch, "--depth", "1").CombinedOutput()
	if fetchErr != nil {
		fetchOut, fetchErr = exec.CommandContext(ctx, "git", "-C", target, "fetch", "origin", "--depth", "1").CombinedOutput()
		if fetchErr != nil {
			return fmt.Errorf("git fetch: %w: %s", fetchErr, strings.TrimSpace(string(fetchOut)))
		}
	}
	resetOut, resetErr := exec.CommandContext(ctx, "git", "-C", target, "reset", "--hard", fmt.Sprintf("origin/%s", branch)).CombinedOutput()
	if resetErr != nil {
		resetOut, resetErr = exec.CommandContext(ctx, "git", "-C", target, "reset", "--hard", "FETCH_HEAD").CombinedOutput()
		if resetErr != nil {
			return fmt.Errorf("git reset: %w: %s", resetErr, strings.TrimSpace(string(resetOut)))
		}
	}
	return nil
}

func (c *Client) readHead(ctx context.Context, target string) (hash string, lastAt time.Time, summary string) {
	hashOut, _ := exec.CommandContext(ctx, "git", "-C", target, "rev-parse", "HEAD").CombinedOutput()
	hash = strings.TrimSpace(string(hashOut))

	logOutput, _ := exec.CommandContext(ctx, "git", "-C", target, "log", "-1", "--format=%cI|%s").CombinedOutput()
	lastAt = time.Now().UTC()
	summary = "latest commit"
	if parts := strings.SplitN(strings.TrimSpace(string(logOutput)), "|", 2); len(parts) == 2 {
		if parsed, parseErr := time.Parse(time.RFC3339, parts[0]); parseErr == nil {
			lastAt = parsed
		}
		summary = parts[1]
	}
	return hash, lastAt, summary
}

func detectLanguages(root string) map[string]int {
	extMap := map[string]string{
		".go": "Go", ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript",
		".jsx": "JavaScript", ".py": "Python", ".rs": "Rust", ".java": "Java",
		".md": "Markdown", ".sql": "SQL",
	}
	counts := map[string]int{}
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			if info != nil && info.IsDir() && (info.Name() == ".git" || info.Name() == "node_modules" || info.Name() == "target") {
				return filepath.SkipDir
			}
			return nil
		}
		ext := filepath.Ext(path)
		if lang, ok := extMap[ext]; ok {
			counts[lang]++
		} else {
			counts["Other"]++
		}
		return nil
	})
	return counts
}
