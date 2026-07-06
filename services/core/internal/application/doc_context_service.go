package application

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	docMaxFilesPerRepo   = 32
	docMaxFileBytes      = 12_000
	docMaxCharsPerRepo   = 80_000
	docMaxTreeEntries    = 200
	docMaxTreeDepth      = 4
)

type DocFileSnippet struct {
	Path    string `json:"path"`
	Kind    string `json:"kind"`
	Content string `json:"content"`
}

type RepoDocContext struct {
	RepoID            string         `json:"repoId"`
	RepoName          string         `json:"repoName"`
	URL               string         `json:"url"`
	LastCommitSummary string         `json:"lastCommitSummary,omitempty"`
	LastCommitAt      string         `json:"lastCommitAt,omitempty"`
	LanguageSummary   map[string]int `json:"languageSummary,omitempty"`
	DirectoryTree     string         `json:"directoryTree"`
	FileContents      []DocFileSnippet `json:"fileContents"`
}

type DocContextResult struct {
	Repos       []RepoDocContext `json:"repos"`
	ContextText string           `json:"contextText"`
}

func (s *IndexService) BuildDocContext(ctx context.Context, repoIDs []string) (DocContextResult, error) {
	if len(repoIDs) == 0 {
		return DocContextResult{}, fmt.Errorf("repoIds required")
	}
	if s.db == nil {
		return DocContextResult{}, fmt.Errorf("database unavailable")
	}

	repos := make([]RepoDocContext, 0, len(repoIDs))
	sections := make([]string, 0, len(repoIDs))

	for _, repoID := range repoIDs {
		repo, err := s.loadRepo(ctx, repoID)
		if err != nil {
			return DocContextResult{}, fmt.Errorf("load repo %s: %w", repoID, err)
		}
		name := repo.ID
		if displayName, nameErr := s.loadRepoDisplayName(ctx, repoID); nameErr == nil && displayName != "" {
			name = displayName
		}

		ctxItem, section, buildErr := s.buildRepoDocContext(ctx, repo, name)
		if buildErr != nil {
			return DocContextResult{}, buildErr
		}
		repos = append(repos, ctxItem)
		sections = append(sections, section)
	}

	return DocContextResult{
		Repos:       repos,
		ContextText: strings.Join(sections, "\n\n---\n\n"),
	}, nil
}

func (s *IndexService) loadRepoDisplayName(ctx context.Context, repoID string) (string, error) {
	var displayName string
	err := s.db.DB().QueryRowContext(ctx, `
		SELECT COALESCE(m.display_name, r.name)
		FROM repos r
		LEFT JOIN repo_metadata m ON m.repo_id = r.id
		WHERE r.id = ?
	`, repoID).Scan(&displayName)
	return displayName, err
}

func (s *IndexService) buildRepoDocContext(ctx context.Context, repo repoRecord, displayName string) (RepoDocContext, string, error) {
	if s.git == nil {
		return s.mockRepoDocContext(repo, displayName), formatRepoDocSection(s.mockRepoDocContext(repo, displayName)), nil
	}

	branch := repo.DefaultBranch
	if branch == "" {
		branch = "main"
	}
	clone, err := s.git.Clone(ctx, repo.URL, branch)
	if err != nil {
		return RepoDocContext{}, "", fmt.Errorf("clone repo %s: %w", repo.ID, err)
	}
	defer os.RemoveAll(clone.Path)

	tree := buildDirectoryTree(clone.Path, docMaxTreeDepth, docMaxTreeEntries)
	files := collectDocFiles(clone.Path)
	snippets := readDocFileSnippets(clone.Path, files)

	item := RepoDocContext{
		RepoID:            repo.ID,
		RepoName:          displayName,
		URL:               repo.URL,
		LastCommitSummary: clone.LastCommitSummary,
		LastCommitAt:      clone.LastCommitAt.UTC().Format("2006-01-02T15:04:05Z"),
		LanguageSummary:   clone.LanguageSummary,
		DirectoryTree:     tree,
		FileContents:      snippets,
	}
	return item, formatRepoDocSection(item), nil
}

func (s *IndexService) mockRepoDocContext(repo repoRecord, displayName string) RepoDocContext {
	return RepoDocContext{
		RepoID:   repo.ID,
		RepoName: displayName,
		URL:      repo.URL,
		DirectoryTree: strings.Join([]string{
			".",
			"├── cmd/",
			"├── internal/",
			"├── pkg/",
			"└── README.md",
		}, "\n"),
		FileContents: []DocFileSnippet{
			{
				Path: "README.md",
				Kind: "readme",
				Content: fmt.Sprintf(
					"# %s\n\nMock 仓库上下文（未配置 Git 客户端）。请配置 GIT_WORK_DIR 并确保 git 可用后重试。",
					displayName,
				),
			},
		},
	}
}

type docFileCandidate struct {
	relPath string
	kind    string
	score   int
}

func collectDocFiles(root string) []docFileCandidate {
	candidates := []docFileCandidate{}
	seen := map[string]bool{}

	add := func(relPath, kind string, score int) {
		if seen[relPath] {
			return
		}
		seen[relPath] = true
		candidates = append(candidates, docFileCandidate{relPath: relPath, kind: kind, score: score})
	}

	_ = filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info.IsDir() {
			if info != nil && info.IsDir() && shouldSkipDir(info.Name()) {
				return filepath.SkipDir
			}
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		base := strings.ToLower(filepath.Base(rel))
		lower := strings.ToLower(rel)

		switch {
		case strings.HasPrefix(base, "readme"):
			add(rel, "readme", 100)
		case base == "package.json" || base == "go.mod" || base == "cargo.toml" ||
			base == "pyproject.toml" || base == "requirements.txt" || base == "pom.xml" ||
			base == "build.gradle" || base == "composer.json":
			add(rel, "manifest", 95)
		case strings.HasSuffix(lower, ".graphql") || strings.HasSuffix(lower, ".prisma") ||
			strings.Contains(lower, "/schema/") || strings.Contains(lower, "/schemas/"):
			add(rel, "schema", 90)
		case strings.Contains(lower, "/migrations/") || strings.Contains(lower, "/migrate/") ||
			strings.HasSuffix(lower, ".sql"):
			add(rel, "migration", 88)
		case strings.Contains(lower, "/routes/") || strings.Contains(lower, "/handlers/") ||
			strings.Contains(lower, "/controllers/") || strings.Contains(lower, "/api/") ||
			strings.Contains(lower, "openapi") || strings.Contains(lower, "swagger"):
			add(rel, "api", 85)
		case base == "dockerfile" || strings.HasPrefix(base, "docker-compose"):
			add(rel, "config", 70)
		case base == "main.go" || base == "index.ts" || base == "index.js" ||
			base == "app.py" || base == "main.py" || base == "server.go":
			add(rel, "source", 80)
		case strings.HasSuffix(lower, ".go") || strings.HasSuffix(lower, ".ts") ||
			strings.HasSuffix(lower, ".tsx") || strings.HasSuffix(lower, ".py") ||
			strings.HasSuffix(lower, ".java") || strings.HasSuffix(lower, ".rs"):
			if strings.Contains(lower, "/model") || strings.Contains(lower, "/entity") ||
				strings.Contains(lower, "/domain/") {
				add(rel, "source", 75)
			}
		}
		return nil
	})

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		return candidates[i].relPath < candidates[j].relPath
	})

	if len(candidates) > docMaxFilesPerRepo {
		candidates = candidates[:docMaxFilesPerRepo]
	}
	return candidates
}

func readDocFileSnippets(root string, files []docFileCandidate) []DocFileSnippet {
	snippets := make([]DocFileSnippet, 0, len(files))
	totalChars := 0

	for _, file := range files {
		abs := filepath.Join(root, file.relPath)
		raw, err := os.ReadFile(abs)
		if err != nil {
			continue
		}
		content := string(raw)
		if len(content) > docMaxFileBytes {
			content = content[:docMaxFileBytes] + "\n\n…(内容已截断)"
		}
		if totalChars+len(content) > docMaxCharsPerRepo {
			remaining := docMaxCharsPerRepo - totalChars
			if remaining <= 0 {
				break
			}
			content = content[:remaining] + "\n\n…(仓库上下文已达上限)"
		}
		totalChars += len(content)
		snippets = append(snippets, DocFileSnippet{
			Path:    file.relPath,
			Kind:    file.kind,
			Content: content,
		})
	}
	return snippets
}

func buildDirectoryTree(root string, maxDepth, maxEntries int) string {
	type node struct {
		name     string
		isDir    bool
		children []*node
	}

	rootNode := &node{name: ".", isDir: true}
	count := 0

	var walk func(current *node, absPath string, depth int)
	walk = func(current *node, absPath string, depth int) {
		if depth >= maxDepth || count >= maxEntries {
			return
		}
		entries, err := os.ReadDir(absPath)
		if err != nil {
			return
		}
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].IsDir() != entries[j].IsDir() {
				return entries[i].IsDir()
			}
			return entries[i].Name() < entries[j].Name()
		})
		for _, entry := range entries {
			if count >= maxEntries {
				return
			}
			if entry.IsDir() && shouldSkipDir(entry.Name()) {
				continue
			}
			child := &node{name: entry.Name(), isDir: entry.IsDir()}
			current.children = append(current.children, child)
			count++
			if entry.IsDir() {
				walk(child, filepath.Join(absPath, entry.Name()), depth+1)
			}
		}
	}
	walk(rootNode, root, 0)

	var lines []string
	var render func(n *node, prefix string, isLast bool)
	render = func(n *node, prefix string, isLast bool) {
		if n.name != "." {
			connector := "├── "
			if isLast {
				connector = "└── "
			}
			name := n.name
			if n.isDir {
				name += "/"
			}
			lines = append(lines, prefix+connector+name)
			if isLast {
				prefix += "    "
			} else {
				prefix += "│   "
			}
		}
		for i, child := range n.children {
			render(child, prefix, i == len(n.children)-1)
		}
	}
	render(rootNode, "", true)
	if len(lines) == 0 {
		return "."
	}
	return strings.Join(lines, "\n")
}

func shouldSkipDir(name string) bool {
	switch name {
	case ".git", "node_modules", "vendor", "target", "dist", "build", ".next", ".venv", "__pycache__":
		return true
	default:
		return false
	}
}

func formatRepoDocSection(item RepoDocContext) string {
	var b strings.Builder
	fmt.Fprintf(&b, "## 仓库：%s\n", item.RepoName)
	fmt.Fprintf(&b, "- 仓库 ID：%s\n", item.RepoID)
	fmt.Fprintf(&b, "- Git 地址：%s\n", item.URL)
	if item.LastCommitAt != "" {
		fmt.Fprintf(&b, "- 最近提交：%s（%s）\n", item.LastCommitSummary, item.LastCommitAt)
	}
	if len(item.LanguageSummary) > 0 {
		langs := make([]string, 0, len(item.LanguageSummary))
		for lang, count := range item.LanguageSummary {
			langs = append(langs, fmt.Sprintf("%s(%d)", lang, count))
		}
		sort.Strings(langs)
		fmt.Fprintf(&b, "- 语言分布：%s\n", strings.Join(langs, ", "))
	}

	b.WriteString("\n### 目录结构\n```\n")
	b.WriteString(item.DirectoryTree)
	b.WriteString("\n```\n")

	for _, file := range item.FileContents {
		fmt.Fprintf(&b, "\n### 文件：%s [%s]\n", file.Path, file.Kind)
		b.WriteString("```\n")
		b.WriteString(file.Content)
		b.WriteString("\n```\n")
	}
	return b.String()
}
