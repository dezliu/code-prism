package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestLocalPath(t *testing.T) {
	c := NewClient("/tmp/work")
	if got := c.LocalPath("repo-abc"); got != filepath.Join("/tmp/work", "repo-abc") {
		t.Fatalf("LocalPath = %q", got)
	}
}

func TestSyncCreatesMirrorDirectory(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping git integration test in short mode")
	}
	if _, err := execLookPath("git"); err != nil {
		t.Skip("git not available")
	}

	workDir := t.TempDir()
	c := NewClient(workDir)
	ctx := context.Background()

	result, err := c.Sync(ctx, "test-repo-id", "https://github.com/octocat/Hello-World.git", "master")
	if err != nil {
		t.Fatalf("Sync: %v", err)
	}
	if result.Path != c.LocalPath("test-repo-id") {
		t.Fatalf("Path = %q", result.Path)
	}
	if result.HeadCommitHash == "" {
		t.Fatal("expected HeadCommitHash")
	}
	if _, err := os.Stat(filepath.Join(result.Path, ".git")); err != nil {
		t.Fatalf("mirror .git missing: %v", err)
	}

	result2, err := c.Sync(ctx, "test-repo-id", "https://github.com/octocat/Hello-World.git", "master")
	if err != nil {
		t.Fatalf("Sync second time: %v", err)
	}
	if result2.HeadCommitHash != result.HeadCommitHash {
		t.Logf("head changed after pull: %s -> %s", result.HeadCommitHash, result2.HeadCommitHash)
	}
}

func execLookPath(name string) (string, error) {
	return exec.LookPath(name)
}
