import type { CoreHttpClient, StreamEvent } from '../../infrastructure/clients/core-http.client.js';
import type { ResolveSymbolsInput } from './resolve-symbols.use-case.js';

export interface StreamResolveSymbolsOutput {
  events: AsyncGenerator<StreamEvent, void, unknown>;
}

/**
 * 流式符号解析 UseCase
 * 
 * 通过 SSE (Server-Sent Events) 实现渐进式结果返回，提升用户体验：
 * 1. parsing - 解析查询参数
 * 2. searching_opensearch - OpenSearch 精确匹配检索
 * 3. searching_qdrant - Qdrant 向量语义检索
 * 4. merging - 合并和重排序结果
 * 5. extracting_snippets - 提取代码片段
 * 6. results - 最终结果
 * 7. done - 完成信号
 */
export class StreamResolveSymbolsUseCase {
  constructor(private readonly core: CoreHttpClient) {}

  async execute(input: ResolveSymbolsInput): Promise<StreamResolveSymbolsOutput> {
    const events = this.core.resolveSymbolsStream({
      query: input.query,
      className: input.className,
      methodName: input.methodName,
      repoIds: input.repoIds,
      limit: input.limit,
    });

    return { events };
  }
}
