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
	Path            string
	DefaultBranch   string
	LastCommitAt    time.Time
	LastCommitSummary string
	LanguageSummary map[string]int
}

type Client struct {
	workDir string
}

func NewClient(workDir string) *Client {
	return &Client{workDir: workDir}
}

func (c *Client) Clone(ctx context.Context, repoURL, branch string) (CloneResult, error) {
	if branch == "" {
		branch = "main"
	}
	if err := os.MkdirAll(c.workDir, 0o755); err != nil {
		return CloneResult{}, fmt.Errorf("mkdir workdir: %w", err)
	}

	target := filepath.Join(c.workDir, fmt.Sprintf("repo-%d", time.Now().UnixNano()))
	args := []string{"clone", "--depth", "1", "--branch", branch, repoURL, target}
	cmd := exec.CommandContext(ctx, "git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		// fallback: clone without branch (repo may use master)
		target = filepath.Join(c.workDir, fmt.Sprintf("repo-%d", time.Now().UnixNano()))
		args = []string{"clone", "--depth", "1", repoURL, target}
		cmd = exec.CommandContext(ctx, "git", args...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			return CloneResult{}, fmt.Errorf("git clone: %w: %s", err, strings.TrimSpace(string(output)))
		}
	}

	logOutput, _ := exec.CommandContext(ctx, "git", "-C", target, "log", "-1", "--format=%cI|%s").CombinedOutput()
	lastAt := time.Now().UTC()
	summary := "latest commit"
	if parts := strings.SplitN(strings.TrimSpace(string(logOutput)), "|", 2); len(parts) == 2 {
		if parsed, parseErr := time.Parse(time.RFC3339, parts[0]); parseErr == nil {
			lastAt = parsed
		}
		summary = parts[1]
	}

	langSummary := detectLanguages(target)
	return CloneResult{
		Path:              target,
		DefaultBranch:     branch,
		LastCommitAt:      lastAt,
		LastCommitSummary: summary,
		LanguageSummary:   langSummary,
	}, nil
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
