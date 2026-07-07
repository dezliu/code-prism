package application

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"strings"
	"unicode"

	gitclient "github.com/lingprism/core/internal/infrastructure/git"
	"github.com/lingprism/core/internal/infrastructure/embedding"
	"github.com/lingprism/core/internal/infrastructure/llm"
	opensearchstore "github.com/lingprism/core/internal/infrastructure/opensearch"
	qdrantclient "github.com/lingprism/core/internal/infrastructure/qdrant"
)

type SymbolResolveService struct {
	qdrant     *qdrantclient.Client
	qdrantDim  int
	embedder   *embedding.Client
	openSearch *opensearchstore.Client
	git        *gitclient.Client
	llmClient  *llm.Client
}

func NewSymbolResolveService(
	qdrant *qdrantclient.Client,
	qdrantDim int,
	embedder *embedding.Client,
	openSearch *opensearchstore.Client,
	git *gitclient.Client,
	llmClient *llm.Client,
) *SymbolResolveService {
	return &SymbolResolveService{
		qdrant: qdrant, qdrantDim: qdrantDim,
		embedder: embedder, openSearch: openSearch, git: git,
		llmClient: llmClient,
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
	Locations  []CodeLocation   `json:"locations"`
	References []KnowledgeRef   `json:"references,omitempty"`
}

// KnowledgeRef 知识文档参考链接
type KnowledgeRef struct {
	DocID    string  `json:"docId"`
	Title    string  `json:"title"`
	Snippet  string  `json:"snippet"`
	Score    float64 `json:"score"`
	RepoID   string  `json:"repoId,omitempty"`
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

	// 阶段 3: Qdrant 向量语义搜索（多路检索 + 降级策略）
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

		// 构建多路检索 query：原始查询 + 关键词提取变体
		searchVariants := buildSearchVariants(query, className, methodName)
		log.Printf("[ResolveStream] search variants: %v", searchVariants)

		totalHits := 0
		filteredCount := 0
		noRepoIDCount := 0

		// 主搜索：用 SearchCodeSymbols 在服务端排除知识文档
		vec := s.embedQuery(ctx, searchText)
		hits, err := s.qdrant.SearchCodeSymbols(ctx, vec, limit*2)
		if err == nil {
			totalHits += len(hits)
			for _, hit := range hits {
				payload := hit.Payload
				if payload.RepoID == "" {
					noRepoIDCount++
					continue
				}
				if len(input.RepoIDs) > 0 && !contains(input.RepoIDs, payload.RepoID) {
					filteredCount++
					continue
				}
				loc := codeLocationFromPayload(payload)
				loc.Score = rerankScore(loc, query, className, methodName, hit.Score)
				mergeLocation(candidates, loc)
			}
		}

		// 降级搜索：如果主搜索无候选，用关键词变体补充
		if len(candidates) == 0 && len(searchVariants) > 1 {
			log.Printf("[ResolveStream] primary search yielded 0 candidates, trying keyword variants")
			for _, variant := range searchVariants {
				if variant == searchText {
					continue // 已搜索过
				}
				vVec := s.embedQuery(ctx, variant)
				vHits, vErr := s.qdrant.SearchCodeSymbols(ctx, vVec, limit)
				if vErr != nil {
					continue
				}
				totalHits += len(vHits)
				for _, hit := range vHits {
					payload := hit.Payload
					if payload.RepoID == "" {
						continue
					}
					if len(input.RepoIDs) > 0 && !contains(input.RepoIDs, payload.RepoID) {
						continue
					}
					loc := codeLocationFromPayload(payload)
					loc.Score = rerankScore(loc, query, className, methodName, hit.Score) * 0.9
					mergeLocation(candidates, loc)
				}
				if len(candidates) > 0 {
					break
				}
			}
		}

		// LLM 降级搜索：如果关键词变体仍无候选，用 LLM 改写 query 再搜索
		if len(candidates) == 0 && s.llmClient != nil && s.llmClient.Available() {
			events <- StreamEvent{
				Event: "status",
				Data:  map[string]string{"phase": "llm_rewrite", "message": "正在使用 LLM 优化搜索查询..."},
			}
			log.Printf("[ResolveStream] keyword variants yielded 0 candidates, trying LLM rewrite")
			llmVariants := expandSearchVariantsWithLLM(ctx, s.llmClient, query)
			log.Printf("[ResolveStream] LLM rewrite variants: %v", llmVariants)
			for _, variant := range llmVariants {
				lVec := s.embedQuery(ctx, variant)
				lHits, lErr := s.qdrant.SearchCodeSymbols(ctx, lVec, limit)
				if lErr != nil {
					continue
				}
				totalHits += len(lHits)
				for _, hit := range lHits {
					payload := hit.Payload
					if payload.RepoID == "" {
						continue
					}
					if len(input.RepoIDs) > 0 && !contains(input.RepoIDs, payload.RepoID) {
						continue
					}
					loc := codeLocationFromPayload(payload)
					loc.Score = rerankScore(loc, query, className, methodName, hit.Score) * 0.85
					mergeLocation(candidates, loc)
				}
				if len(candidates) > 0 {
					break
				}
			}
		}

		log.Printf("[ResolveStream] Qdrant filter stats: total=%d no_repo_id=%d repo_filtered=%d candidates=%d",
			totalHits, noRepoIDCount, filteredCount, len(candidates))

		events <- StreamEvent{
			Event: "progress",
			Data: map[string]interface{}{
				"source": "qdrant",
				"count":  totalHits,
				"message": fmt.Sprintf("Qdrant 找到 %d 个代码候选（%d 无仓库ID, %d 通过过滤）",
					totalHits, noRepoIDCount, len(candidates)),
			},
		}
	}

	// 阶段 4: 知识文档参考检索（独立于代码符号搜索）
	var references []KnowledgeRef
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "searching_knowledge", "message": "正在检索相关知识文档..."},
	}
	{
		refVec := s.embedQuery(ctx, query)
		refHits, refErr := s.qdrant.SearchKnowledgeDocs(ctx, refVec, 3)
		if refErr == nil {
			for _, hit := range refHits {
				p := hit.Payload
				if p.RepoID == "" && len(input.RepoIDs) > 0 {
					continue
				}
				if len(input.RepoIDs) > 0 && p.RepoID != "" && !contains(input.RepoIDs, p.RepoID) {
					continue
				}
				references = append(references, KnowledgeRef{
					DocID:   p.DocID,
					Title:   p.Symbol,
					Snippet: truncateSnippet(p.Snippet, 200),
					Score:   hit.Score,
					RepoID:  p.RepoID,
				})
			}
		}
	}

	// 阶段 5: 合并与重排序
	events <- StreamEvent{
		Event: "status",
		Data:  map[string]string{"phase": "merging", "message": "正在合并和重排序结果..."},
	}

	log.Printf("[ResolveStream] candidates after search: %d, references: %d (query=%q)", len(candidates), len(references), query)

	locations := make([]CodeLocation, 0, len(candidates))
	for _, loc := range candidates {
		locations = append(locations, loc)
	}

	// 阶段 6: 提取代码片段
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

	// 阶段 7: 发送最终结果
	events <- StreamEvent{
		Event: "results",
		Data:  SymbolResolveResult{Locations: locations, References: references},
	}

	total := len(locations) + len(references)
	events <- StreamEvent{
		Event: "done",
		Data:  map[string]interface{}{"total": total, "message": "检索完成"},
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
	qualifiedRef := p.QualifiedRef
	if qualifiedRef == "" || qualifiedRef == "<nil>" {
		// 回退：用 Symbol / FilePath 构建 qualifiedRef，避免候选被过滤
		if p.Symbol != "" {
			if p.FilePath != "" {
				qualifiedRef = fmt.Sprintf("%s::%s", p.FilePath, p.Symbol)
			} else {
				qualifiedRef = p.Symbol
			}
		} else if p.FilePath != "" {
			qualifiedRef = p.FilePath
		}
	}
	return CodeLocation{
		RepoID: p.RepoID, RepoName: p.RepoName, RepoURL: p.RepoURL,
		FilePath: p.FilePath, Language: p.Language,
		PackageName: p.PackageName, ClassName: p.ClassName,
		MethodName: methodName, SymbolKind: p.SymbolKind,
		StartLine: p.StartLine, EndLine: p.EndLine,
		DocComment: p.DocComment, QualifiedRef: qualifiedRef,
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
	if loc.RepoID == "" {
		return
	}
	// 当 QualifiedRef 为空时，用 FilePath + StartLine 作为兜底 key
	key := fmt.Sprintf("%s:%s:%d", loc.RepoID, loc.QualifiedRef, loc.StartLine)
	if loc.QualifiedRef == "" {
		key = fmt.Sprintf("%s:%s:%d", loc.RepoID, loc.FilePath, loc.StartLine)
	}
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

// ---------- 查询关键词提取与搜索变体 ----------

var (
	_englishEntityRe = regexp.MustCompile(`[A-Za-z][A-Za-z0-9_-]*`)
	_chineseTopicRe  = regexp.MustCompile(`[\p{Han}]{2,}`)
	_questionSuffixRe = regexp.MustCompile(`[？?！!。.,，的了吗呢吧]+$`)
)

// extractQueryKeywords 从自然语言查询中提取关键词（参考 AI Worker 的 extract_keywords）
func extractQueryKeywords(query string) []string {
	seen := map[string]bool{}
	var keywords []string

	add := func(token string) {
		token = strings.TrimSpace(token)
		token = _questionSuffixRe.ReplaceAllString(token, "")
		token = strings.TrimSpace(token)
		if len(token) < 2 || seen[token] {
			return
		}
		seen[token] = true
		keywords = append(keywords, token)
	}

	// 提取英文标识符（类名、方法名、模块名等）
	for _, m := range _englishEntityRe.FindAllString(query, -1) {
		add(m)
	}

	// 提取中文主题词
	for _, m := range _chineseTopicRe.FindAllString(query, -1) {
		// 过滤掉常见的疑问词
		if isCommonQuestionWord(m) {
			continue
		}
		add(m)
	}

	return keywords
}

// isCommonQuestionWord 判断是否为常见疑问/停用词
func isCommonQuestionWord(w string) bool {
	stopWords := map[string]bool{
		"在哪": true, "哪里": true, "哪个": true, "什么": true,
		"怎么": true, "如何": true, "为什么": true, "是否": true,
		"可以": true, "能够": true, "有没有": true, "请问": true,
		"代码": true, "入口": true, "管理": true,
	}
	return stopWords[w]
}

// buildSearchVariants 构建多路检索查询变体
func buildSearchVariants(query, className, methodName string) []string {
	seen := map[string]bool{}
	var variants []string

	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		variants = append(variants, s)
	}

	// 1. 原始查询（带符号前缀）
	base := query
	if methodName != "" {
		base = methodName + " " + base
	}
	if className != "" {
		base = className + " " + base
	}
	add(base)

	// 2. 提取关键词组合
	keywords := extractQueryKeywords(query)
	if len(keywords) > 0 {
		keywordQuery := strings.Join(keywords, " ")
		if className != "" {
			keywordQuery = className + " " + keywordQuery
		}
		if methodName != "" {
			keywordQuery = methodName + " " + keywordQuery
		}
		add(keywordQuery)

		// 3. 仅英文标识符（如果有）
		var englishOnly []string
		for _, kw := range keywords {
			if isEnglishIdentifier(kw) {
				englishOnly = append(englishOnly, kw)
			}
		}
		if len(englishOnly) > 0 {
			add(strings.Join(englishOnly, " "))
		}
	}

	return variants
}

func isEnglishIdentifier(s string) bool {
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' && r != '-' {
			return false
		}
	}
	return len(s) > 0 && (s[0] >= 'A' && s[0] <= 'Z' || s[0] >= 'a' && s[0] <= 'z')
}

// truncateSnippet 截断文本到指定长度
func truncateSnippet(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
