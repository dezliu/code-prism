package application

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCollectDocFiles_PrioritizesReadmeAndManifest(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "README.md"), "# Demo")
	mustWrite(t, filepath.Join(root, "go.mod"), "module demo")
	mustWrite(t, filepath.Join(root, "internal", "service.go"), "package internal")

	files := collectDocFiles(root)
	if len(files) < 2 {
		t.Fatalf("expected at least 2 files, got %d", len(files))
	}
	if files[0].kind != "readme" {
		t.Fatalf("expected readme first, got %s", files[0].kind)
	}
}

func TestBuildDirectoryTree_SkipsVendorDirs(t *testing.T) {
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, "node_modules", "pkg"), 0o755)
	_ = os.MkdirAll(filepath.Join(root, "src"), 0o755)

	tree := buildDirectoryTree(root, docMaxTreeDepth, docMaxTreeEntries)
	if tree == "" {
		t.Fatal("expected non-empty tree")
	}
	if strings.Contains(tree, "node_modules") {
		t.Fatal("node_modules should be skipped")
	}
	if !strings.Contains(tree, "src/") {
		t.Fatal("expected src directory in tree")
	}
}

func TestFormatRepoDocSection_IncludesFiles(t *testing.T) {
	section := formatRepoDocSection(RepoDocContext{
		RepoID:   "repo-1",
		RepoName: "Demo",
		URL:      "https://example.com/demo.git",
		DirectoryTree: ".\n└── README.md",
		FileContents: []DocFileSnippet{
			{Path: "README.md", Kind: "readme", Content: "# Hello"},
		},
	})
	if !strings.Contains(section, "Demo") || !strings.Contains(section, "README.md") || !strings.Contains(section, "# Hello") {
		t.Fatalf("unexpected section: %s", section)
	}
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
