package application

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/lingprism/core/internal/infrastructure/llm"
)

// expandQueryWithLLM 使用 LLM 将用户中文 query 改写为更适合代码检索的 query。
// 参考 AI Worker 的 expand_query_with_llm (HyDE 策略)。
// 超时 5 秒或失败时返回空列表，不阻塞主搜索流程。
func expandQueryWithLLM(ctx context.Context, client *llm.Client, query string) []string {
	if client == nil || !client.Available() {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	messages := []llm.Message{
		{
			Role: "system",
			Content: `你是企业代码库检索助手。请将用户问题改写为 2-3 个更适合代码全文与语义检索的搜索 query。
规则：
- 每行一个 query，不要编号
- 可中英文混合，保留核心实体名（类名、方法名、模块名）
- 将中文功能描述翻译为对应的英文代码术语（如"订单"→"order"，"回滚"→"rollback"，"编排"→"workflow/orchestration/chain"，"知识库"→"knowledge"）
- 如果用户问的是代码位置，提取关键标识符
- 如果用户提到项目/产品名（如 codeprism、lingprism），不要将其作为代码符号，而是关注其功能描述部分
- 只输出改写后的 query，不要解释`,
		},
		{
			Role:    "user",
			Content: query,
		},
	}

	result, err := client.ChatComplete(ctx, messages, 0.3)
	if err != nil {
		log.Printf("[QueryEnhance] LLM rewrite failed: %v", err)
		return nil
	}

	return parseLLMRewriteResult(result)
}

// parseLLMRewriteResult 解析 LLM 返回的改写结果，按行拆分并去重
func parseLLMRewriteResult(result string) []string {
	seen := map[string]bool{}
	var queries []string

	for _, line := range strings.Split(result, "\n") {
		line = strings.TrimSpace(line)
		// 去除编号前缀 (1. 2. - * 等)
		line = strings.TrimLeft(line, "0123456789.-*) ")
		line = strings.TrimSpace(line)
		if line == "" || seen[line] {
			continue
		}
		seen[line] = true
		queries = append(queries, line)
	}
	return queries
}

// expandSearchVariantsWithLLM 用 LLM 改写结果构建额外的搜索变体。
// 返回的变体用于降级搜索，按优先级排列。
func expandSearchVariantsWithLLM(ctx context.Context, client *llm.Client, query string) []string {
	rewritten := expandQueryWithLLM(ctx, client, query)
	if len(rewritten) == 0 {
		return nil
	}

	// 额外添加 underscore/dash 互换变体
	var variants []string
	for _, q := range rewritten {
		variants = append(variants, q)
		// underscore ↔ dash 互换
		if strings.Contains(q, "_") {
			variants = append(variants, strings.ReplaceAll(q, "_", "-"))
		}
		if strings.Contains(q, "-") {
			variants = append(variants, strings.ReplaceAll(q, "-", "_"))
		}
	}

	// 去重
	seen := map[string]bool{}
	var unique []string
	for _, v := range variants {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		unique = append(unique, v)
	}
	return unique
}
