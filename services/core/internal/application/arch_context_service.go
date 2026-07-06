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
	archMaxFilesPerRepo = 32
	archMaxFileBytes    = 12_000
	archMaxCharsPerRepo = 80_000
	archMaxTreeEntries  = 200
	archMaxTreeDepth    = 4
)

type ArchFileSnippet struct {
	Path    string `json:"path"`
	Kind    string `json:"kind"`
	Content string `json:"content"`
}

type ArchContextResult struct {
	RepoID      string            `json:"repoId"`
	RepoName    string            `json:"repoName"`
	URL         string            `json:"url"`
	ContextText string            `json:"contextText"`
	Repo        RepoDocContext    `json:"repo"`
}

func (s *IndexService) BuildArchContext(ctx context.Context, repoID string) (ArchContextResult, error) {
	if repoID == "" {
		return ArchContextResult{}, fmt.Errorf("repoId required")
	}
	if s.db == nil {
		return ArchContextResult{}, fmt.Errorf("database unavailable")
	}

	repo, err := s.loadRepo(ctx, repoID)
	if err != nil {
		return ArchContextResult{}, fmt.Errorf("load repo %s: %w", repoID, err)
	}

	displayName := repo.ID
	if name, nameErr := s.loadRepoDisplayName(ctx, repoID); nameErr == nil && name != "" {
		displayName = name
	}

	repoCtx, section, buildErr := s.buildRepoArchContext(ctx, repo, displayName)
	if buildErr != nil {
		return ArchContextResult{}, buildErr
	}

	return ArchContextResult{
		RepoID:      repoID,
		RepoName:    displayName,
		URL:         repo.URL,
		ContextText: section,
		Repo:        repoCtx,
	}, nil
}

func (s *IndexService) buildRepoArchContext(ctx context.Context, repo repoRecord, displayName string) (RepoDocContext, string, error) {
	if s.git == nil {
		mock := s.mockRepoArchContext(repo, displayName)
		return mock, formatRepoArchSection(mock), nil
	}

	branch := repo.DefaultBranch
	if branch == "" {
		branch = "main"
	}
	clone, err := s.git.Sync(ctx, repo.ID, repo.URL, branch)
	if err != nil {
		return RepoDocContext{}, "", fmt.Errorf("sync repo %s: %w", repo.ID, err)
	}

	tree := buildDirectoryTree(clone.Path, archMaxTreeDepth, archMaxTreeEntries)
	files := collectArchFiles(clone.Path)
	snippets := readArchFileSnippets(clone.Path, files)

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
	return item, formatRepoArchSection(item), nil
}

func (s *IndexService) mockRepoArchContext(repo repoRecord, displayName string) RepoDocContext {
	return RepoDocContext{
		RepoID:   repo.ID,
		RepoName: displayName,
		URL:      repo.URL,
		DirectoryTree: strings.Join([]string{
			".",
			"├── cmd/",
			"├── internal/",
			"├── services/",
			"├── docker-compose.yml",
			"└── README.md",
		}, "\n"),
		FileContents: []DocFileSnippet{
			{
				Path: "README.md",
				Kind: "readme",
				Content: fmt.Sprintf(
					"# %s\n\nMock 架构上下文（未配置 Git 客户端）。请配置 GIT_WORK_DIR 并确保 git 可用后重试。",
					displayName,
				),
			},
		},
	}
}

type archFileCandidate struct {
	relPath string
	kind    string
	score   int
}

func collectArchFiles(root string) []archFileCandidate {
	candidates := []archFileCandidate{}
	seen := map[string]bool{}

	add := func(relPath, kind string, score int) {
		if seen[relPath] {
			return
		}
		seen[relPath] = true
		candidates = append(candidates, archFileCandidate{relPath: relPath, kind: kind, score: score})
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
		case strings.HasPrefix(base, "readme") || strings.Contains(lower, "architecture"):
			add(rel, "readme", 100)
		case strings.Contains(lower, "docs/arch"):
			add(rel, "readme", 100)
		case base == "dockerfile" || strings.HasPrefix(base, "docker-compose") ||
			strings.Contains(lower, "/k8s/") || strings.Contains(lower, "/helm/") ||
			strings.Contains(lower, "/terraform/"):
			add(rel, "deploy", 95)
		case base == "package.json" || base == "go.mod" || base == "cargo.toml" ||
			base == "pyproject.toml" || base == "pom.xml" || base == "build.gradle":
			add(rel, "manifest", 90)
		case strings.Contains(lower, "/cmd/") || base == "main.go" || base == "index.ts" ||
			base == "index.js" || base == "app.py" || base == "main.py" || base == "server.go":
			add(rel, "entry", 88)
		case strings.Contains(lower, "/routes/") || strings.Contains(lower, "/handlers/") ||
			strings.Contains(lower, "/controllers/") || strings.HasSuffix(lower, ".graphql") ||
			strings.Contains(lower, "openapi") || strings.Contains(lower, "swagger"):
			add(rel, "api", 85)
		case strings.Contains(lower, "/internal/") || strings.Contains(lower, "/services/") ||
			strings.Contains(lower, "/application/"):
			if base == "index.ts" || base == "index.js" || base == "mod.rs" || strings.HasSuffix(lower, ".go") {
				add(rel, "module", 82)
			}
		case strings.Contains(lower, "/migrations/") || strings.HasSuffix(lower, ".sql") ||
			strings.Contains(lower, "/models/") || strings.Contains(lower, "/entity/"):
			add(rel, "data", 80)
		case base == "nginx.conf" || base == ".env.example" || strings.HasSuffix(lower, ".env.example"):
			add(rel, "infra", 75)
		}
		return nil
	})

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		return candidates[i].relPath < candidates[j].relPath
	})

	if len(candidates) > archMaxFilesPerRepo {
		candidates = candidates[:archMaxFilesPerRepo]
	}
	return candidates
}

func readArchFileSnippets(root string, files []archFileCandidate) []DocFileSnippet {
	snippets := make([]DocFileSnippet, 0, len(files))
	totalChars := 0

	for _, file := range files {
		abs := filepath.Join(root, file.relPath)
		raw, err := os.ReadFile(abs)
		if err != nil {
			continue
		}
		content := string(raw)
		if len(content) > archMaxFileBytes {
			content = content[:archMaxFileBytes] + "\n\n…(内容已截断)"
		}
		if totalChars+len(content) > archMaxCharsPerRepo {
			remaining := archMaxCharsPerRepo - totalChars
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

func formatRepoArchSection(item RepoDocContext) string {
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

	deployKinds := map[string]bool{"deploy": true, "infra": true, "entry": true}
	apiKinds := map[string]bool{"api": true, "module": true, "manifest": true}
	dataKinds := map[string]bool{"data": true, "readme": true}

	var deployFiles, apiFiles, dataFiles, otherFiles []DocFileSnippet
	for _, file := range item.FileContents {
		switch {
		case deployKinds[file.Kind]:
			deployFiles = append(deployFiles, file)
		case apiKinds[file.Kind]:
			apiFiles = append(apiFiles, file)
		case dataKinds[file.Kind]:
			dataFiles = append(dataFiles, file)
		default:
			otherFiles = append(otherFiles, file)
		}
	}

	writeFileGroup := func(title string, files []DocFileSnippet) {
		if len(files) == 0 {
			return
		}
		fmt.Fprintf(&b, "\n### %s\n", title)
		for _, file := range files {
			fmt.Fprintf(&b, "\n#### 文件：%s [%s]\n", file.Path, file.Kind)
			b.WriteString("```\n")
			b.WriteString(file.Content)
			b.WriteString("\n```\n")
		}
	}

	writeFileGroup("部署与运行线索", deployFiles)
	writeFileGroup("模块与接口线索", apiFiles)
	writeFileGroup("数据层线索", dataFiles)
	writeFileGroup("其他线索", otherFiles)

	return b.String()
}
