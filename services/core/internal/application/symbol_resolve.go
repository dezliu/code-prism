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
	// 流式版本委托给新方法
	resultChan := make(chan StreamEvent, 10)
	defer close(resultChan)

	go func() {
		s.ResolveStream(ctx, input, resultChan)
	}()

	// 收集所有事件并返回最终结果
	var finalResult SymbolResolveResult
	for event := range resultChan {
		if event.Event == "results" {
			finalResult = event.Data.(SymbolResolveResult)
		}
	}
	return finalResult, nil
}

// StreamEvent 表示流式事件
type StreamEvent struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

// ResolveStream 流式解析符号，通过 channel 发送事件
func (s *SymbolResolveService) ResolveStream(ctx context.Context, input SymbolResolveInput, events chan<- StreamEvent) {
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

	// 阶段 1: 发送解析状态
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "parsing", "message": "正在解析查询..."},
	}

	candidates := map[string]CodeLocation{}

	// 阶段 2: OpenSearch 检索
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "searching_opensearch", "message": "正在检索代码符号库..."},
	}

	if s.openSearch != nil && s.openSearch.Enabled() {
		docs, err := s.openSearch.SearchCodeSymbols(ctx, query, className, methodName, input.RepoIDs, limit*2)
		if err == nil {
			osCount := len(docs)
			events <- StreamEvent{
				Event: "progress",
				Data:  map[string]interface{}{"source": "opensearch", "count": osCount, "message": fmt.Sprintf("OpenSearch 找到 %d 个候选", osCount)},
			}
			for _, doc := range docs {
				loc := codeLocationFromOS(doc)
				loc.Score = rerankScore(loc, query, className, methodName, doc.Score)
				mergeLocation(candidates, loc)
			}
		}
	}

	// 阶段 3: Qdrant 向量语义搜索
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "searching_qdrant", "message": "正在进行语义向量检索..."},
	}

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
			qdrantCount := len(hits)
			events <- StreamEvent{
				Event: "progress",
				Data:  map[string]interface{}{"source": "qdrant", "count": qdrantCount, "message": fmt.Sprintf("Qdrant 找到 %d 个候选", qdrantCount)},
			}
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

	// 阶段 4: 合并与重排序
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "merging", "message": "正在合并和重排序结果..."},
	}

	locations := make([]CodeLocation, 0, len(candidates))
	for _, loc := range candidates {
		locations = append(locations, loc)
	}

	// 阶段 5: 提取代码片段
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "extracting_snippets", "message": "正在提取代码片段..."},
	}

	if s.git != nil {
		for i := range locations {
			loc := &locations[i]
			if loc.RepoID != "" && loc.FilePath != "" && loc.StartLine > 0 && loc.EndLine > 0 {
				maxLines := 200
				endLine := loc.EndLine
				if endLine-loc.StartLine+1 > maxLines {
					endLine = loc.StartLine + maxLines - 1
				}

				codeSnippet, err := s.git.ExtractCodeSnippet(loc.RepoID, loc.FilePath, loc.StartLine, endLine)
				if err == nil {
					loc.CodeSnippet = codeSnippet
				} else {
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

	// 阶段 6: 发送最终结果
	events <- StreamEvent{
		Event: "results",
		Data:  SymbolResolveResult{Locations: locations},
	}

	events <- StreamEvent{
		Event: "done",
		Data:  map[string]interface{}{"total": len(locations), "message": "检索完成"},
	}
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
