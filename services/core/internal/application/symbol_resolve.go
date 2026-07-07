package application

import (
	"context"
	"fmt"
	"log"
	"strings"

	gitclient "github.com/lingprism/core/internal/infrastructure/git"
	"github.com/lingprism/core/internal/infrastructure/embedding"
	opensearchstore "github.com/lingprism/core/internal/infrastructure/opensearch"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

type SymbolResolveService struct {
	qdrant     *qdrantclient.Client
	qdrantDim  int
	embedder   *embedding.Client
	openSearch *opensearchstore.Client
	git        *gitclient.Client // 新增：Git Client 用于提取代码片段
}

func NewSymbolResolveService(
	qdrant *qdrantclient.Client,
	qdrantDim int,
	embedder *embedding.Client,
	openSearch *opensearchstore.Client,
	git *gitclient.Client, // 新增参数
) *SymbolResolveService {
	return &SymbolResolveService{
		qdrant: qdrant, qdrantDim: qdrantDim,
		embedder: embedder, openSearch: openSearch, git: git,
	}
}

type SymbolResolveInput struct {
	Query      string   `json:"query"`
	ClassName  string   `json:"className,omitempty"`
	MethodName string   `json:"methodName,omitempty"`
	RepoIDs    []string `json:"repoIds,omitempty"`
	Limit      int      `json:"limit,omitempty"`
}

type CodeLocation struct {
	RepoID       string  `json:"repoId"`
	RepoName     string  `json:"repoName"`
	RepoURL      string  `json:"repoUrl"`
	FilePath     string  `json:"filePath"`
	Language     string  `json:"language,omitempty"`
	PackageName  string  `json:"packageName,omitempty"`
	ClassName    string  `json:"className,omitempty"`
	MethodName   string  `json:"methodName,omitempty"`
	SymbolKind   string  `json:"symbolKind,omitempty"`
	StartLine    int     `json:"startLine"`
	EndLine      int     `json:"endLine"`
	DocComment   string  `json:"docComment,omitempty"`
	QualifiedRef string  `json:"qualifiedRef"`
	Snippet      string  `json:"snippet,omitempty"`
	CodeSnippet  string  `json:"codeSnippet,omitempty"` // 新增：实际代码片段（带行号）
	Score        float64 `json:"score,omitempty"`
}

type SymbolResolveResult struct {
	Locations []CodeLocation `json:"locations"`
}

func (s *SymbolResolveService) Resolve(ctx context.Context, input SymbolResolveInput) (SymbolResolveResult, error) {
	limit := input.Limit
	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		limit = 20
	}

	query := strings.TrimSpace(input.Query)
	className := strings.TrimSpace(input.ClassName)
	methodName := strings.TrimSpace(input.MethodName)

	// 判断是否为精确符号查询
	isExactQuery := className != "" || methodName != ""

	candidates := map[string]CodeLocation{}

	// 策略 1: OpenSearch 精确/模糊匹配
	if s.openSearch != nil && s.openSearch.Enabled() {
		docs, err := s.openSearch.SearchCodeSymbols(ctx, query, className, methodName, input.RepoIDs, limit*2)
		if err == nil {
			for _, doc := range docs {
				loc := codeLocationFromOS(doc)
				loc.Score = rerankScore(loc, query, className, methodName, doc.Score)
				mergeLocation(candidates, loc)
			}
		}
	}

	// 策略 2: Qdrant 向量语义搜索（对自然语言查询更有效）
	if s.qdrant != nil {
		searchText := query
		if methodName != "" {
			searchText = methodName + " " + searchText
		}
		if className != "" {
			searchText = className + " " + searchText
		}
		vec := s.embedQuery(ctx, searchText)
		hits, err := s.qdrant.Search(ctx, vec, limit*2)
		if err == nil {
			for _, hit := range hits {
				payload := hit.Payload
				if payload.RepoID == "" || payload.Kind == "knowledge_doc" {
					continue
				}
				if len(input.RepoIDs) > 0 && !contains(input.RepoIDs, payload.RepoID) {
					continue
				}
				loc := codeLocationFromPayload(payload)
				loc.Score = rerankScore(loc, query, className, methodName, hit.Score)
				mergeLocation(candidates, loc)
			}
		}
	}

	// 策略 3: 如果是自然语言查询且上述无结果，尝试普通 search 作为兜底
	if len(candidates) == 0 && !isExactQuery && query != "" {
		// 这里可以调用普通的全文检索，但目前 resolve_symbols 只处理符号
		// 暂时保留这个注释，未来可以扩展
	}

	locations := make([]CodeLocation, 0, len(candidates))
	for _, loc := range candidates {
		locations = append(locations, loc)
	}

	// 新增：为每个位置提取实际代码片段
	if s.git != nil {
		for i := range locations {
			loc := &locations[i]
			if loc.RepoID != "" && loc.FilePath != "" && loc.StartLine > 0 && loc.EndLine > 0 {
				// 限制最大行数，避免过大的代码片段
				maxLines := 200
				endLine := loc.EndLine
				if endLine-loc.StartLine+1 > maxLines {
					endLine = loc.StartLine + maxLines - 1
				}
				
				codeSnippet, err := s.git.ExtractCodeSnippet(loc.RepoID, loc.FilePath, loc.StartLine, endLine)
				if err == nil {
					loc.CodeSnippet = codeSnippet
				} else {
					// 记录错误但不中断，继续处理其他位置
					log.Printf(`{"level":"warn","msg":"extract code snippet failed","repoId":%q,"file":%q,"error":%q}`, 
						loc.RepoID, loc.FilePath, err.Error())
				}
			}
		}
	}

	sortLocations(locations)
	if len(locations) > limit {
		locations = locations[:limit]
	}

	return SymbolResolveResult{Locations: locations}, nil
}

func (s *SymbolResolveService) embedQuery(ctx context.Context, query string) []float32 {
	if s.embedder != nil {
		vec, err := s.embedder.Embed(ctx, query)
		if err == nil && len(vec) > 0 {
			return vec
		}
	}
	return qdrantclient.HashEmbed(query, s.qdrantDim)
}

func codeLocationFromOS(doc opensearchstore.CodeSymbolDocument) CodeLocation {
	methodName := doc.MethodName
	if methodName == "" {
		methodName = doc.Symbol
	}
	return CodeLocation{
		RepoID: doc.RepoID, RepoName: doc.RepoName, RepoURL: doc.RepoURL,
		FilePath: doc.FilePath, Language: doc.Language,
		PackageName: doc.PackageName, ClassName: doc.ClassName,
		MethodName: methodName, SymbolKind: doc.SymbolKind,
		StartLine: doc.StartLine, EndLine: doc.EndLine,
		DocComment: doc.DocComment, QualifiedRef: doc.QualifiedRef,
		Snippet: doc.Snippet,
	}
}

func codeLocationFromPayload(p qdrantclient.PointPayload) CodeLocation {
	methodName := p.MethodName
	if methodName == "" {
		methodName = p.Symbol
	}
	return CodeLocation{
		RepoID: p.RepoID, RepoName: p.RepoName, RepoURL: p.RepoURL,
		FilePath: p.FilePath, Language: p.Language,
		PackageName: p.PackageName, ClassName: p.ClassName,
		MethodName: methodName, SymbolKind: p.SymbolKind,
		StartLine: p.StartLine, EndLine: p.EndLine,
		DocComment: p.DocComment, QualifiedRef: p.QualifiedRef,
		Snippet: p.Snippet,
	}
}

func rerankScore(loc CodeLocation, query, className, methodName string, base float64) float64 {
	score := base
	qLower := strings.ToLower(query)
	if loc.QualifiedRef != "" && strings.EqualFold(loc.QualifiedRef, query) {
		score += 100
	}
	if methodName != "" && strings.EqualFold(loc.MethodName, methodName) {
		score += 50
	} else if loc.MethodName != "" && strings.EqualFold(loc.MethodName, qLower) {
		score += 40
	}
	if className != "" && strings.EqualFold(loc.ClassName, className) {
		score += 30
	}
	if query != "" && strings.Contains(strings.ToLower(loc.QualifiedRef), strings.ToLower(query)) {
		score += 10
	}
	return score
}

func mergeLocation(candidates map[string]CodeLocation, loc CodeLocation) {
	if loc.RepoID == "" || loc.QualifiedRef == "" {
		return
	}
	key := fmt.Sprintf("%s:%s:%d", loc.RepoID, loc.QualifiedRef, loc.StartLine)
	if existing, ok := candidates[key]; ok {
		if loc.Score > existing.Score {
			candidates[key] = loc
		}
		return
	}
	candidates[key] = loc
}

func sortLocations(locations []CodeLocation) {
	for i := 0; i < len(locations); i++ {
		for j := i + 1; j < len(locations); j++ {
			if locations[j].Score > locations[i].Score {
				locations[i], locations[j] = locations[j], locations[i]
			}
		}
	}
}
