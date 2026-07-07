/** Core 内部 HTTP 客户端 — Batch 5 P0 业务编排 */

import { ApplicationError } from '../../domain/errors.js';

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  languageSummary?: Record<string, number>;
  lastCommitAt?: string;
  lastCommitSummary?: string;
}

export interface EnqueueIndexResult {
  jobId: string;
  status: string;
}

export interface RemoveIndexResult {
  repoId: string;
  removed: boolean;
}

export interface SearchHit {
  type: 'code' | 'doc' | 'repo';
  title: string;
  snippet: string;
  ref?: string;
}

export interface CodeLocation {
  repoId: string;
  repoName: string;
  repoUrl: string;
  filePath: string;
  language?: string;
  packageName?: string;
  className?: string;
  methodName: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  docComment?: string;
  qualifiedRef: string;
  snippet?: string;
  score?: number;
}

export interface ResolveSymbolsResult {
  locations: CodeLocation[];
}

// SSE 流式事件类型
export type StreamEventType = 'status' | 'progress' | 'results' | 'done' | 'error';

export interface StreamEvent {
  event: StreamEventType;
  data: any;
}

export interface RepoDocContext {
  repoId: string;
  repoName: string;
  url: string;
  lastCommitSummary?: string;
  lastCommitAt?: string;
  languageSummary?: Record<string, number>;
  directoryTree: string;
  fileContents: Array<{ path: string; kind: string; content: string }>;
}

export interface DocContextResult {
  repos: RepoDocContext[];
  contextText: string;
}

export interface ArchContextResult {
  repoId: string;
  repoName: string;
  url: string;
  contextText: string;
}

export interface CoreHttpClient {
  testConnection(input: {
    url: string;
    authType: string;
    defaultBranch: string;
  }): Promise<TestConnectionResult>;
  enqueueIndex(repoId: string): Promise<EnqueueIndexResult>;
  removeIndex(repoId: string): Promise<RemoveIndexResult>;
  search(query: string, repoIds?: string[]): Promise<SearchHit[]>;
  resolveSymbols(input: {
    query: string;
    className?: string;
    methodName?: string;
    repoIds?: string[];
    limit?: number;
  }): Promise<ResolveSymbolsResult>;
  /** SSE 流式符号解析 */
  resolveSymbolsStream(input: {
    query: string;
    className?: string;
    methodName?: string;
    repoIds?: string[];
    limit?: number;
  }): AsyncGenerator<StreamEvent, void, unknown>;
  indexKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string }>;
  removeKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string; removed: boolean }>;
  buildDocContext(repoIds: string[]): Promise<DocContextResult>;
  buildArchContext(repoId: string): Promise<ArchContextResult>;
  /** @deprecated drafts are created by API orchestrator */
  generateArchDraft(repoId: string): Promise<{ snapshotId: string }>;
}

export class CoreHttpClientImpl implements CoreHttpClient {
  private activeBaseUrl: string;

  constructor(private readonly baseUrls: string[]) {
    if (baseUrls.length === 0) {
      throw new Error('CoreHttpClient requires at least one base URL');
    }
    this.activeBaseUrl = baseUrls[0]!;
  }

  private async request<T>(path: string, init?: RequestInit, timeoutMs = 60_000): Promise<T> {
    const candidates = [
      this.activeBaseUrl,
      ...this.baseUrls.filter((url) => url !== this.activeBaseUrl),
    ];
    let lastError: unknown;

    for (const baseUrl of candidates) {
      const url = `${baseUrl}${path}`;
      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
          },
          signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`core request failed (${res.status}): ${text}`);
        }
        this.activeBaseUrl = baseUrl;
        return (await res.json()) as T;
      } catch (error) {
        lastError = error;
      }
    }

    throw new ApplicationError(
      'Core 服务不可达。本地开发请先启动：cd services/core && go run ./cmd/server（若 8080 被占用，Core 会监听 18080，API 将自动尝试）',
      'CORE_UNAVAILABLE',
      lastError,
    );
  }

  async testConnection(input: {
    url: string;
    authType: string;
    defaultBranch: string;
  }): Promise<TestConnectionResult> {
    return this.request('/internal/repos/test-connection', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async enqueueIndex(repoId: string): Promise<EnqueueIndexResult> {
    return this.request('/internal/index/enqueue', {
      method: 'POST',
      body: JSON.stringify({ repoId }),
    });
  }

  async removeIndex(repoId: string): Promise<RemoveIndexResult> {
    return this.request('/internal/index/remove', {
      method: 'POST',
      body: JSON.stringify({ repoId }),
    });
  }

  async search(query: string, repoIds?: string[]): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q: query });
    if (repoIds?.length) {
      params.set('repoIds', repoIds.join(','));
    }
    const data = await this.request<{ hits: SearchHit[] }>(`/internal/search?${params}`);
    return data.hits;
  }

  async resolveSymbols(input: {
    query: string;
    className?: string;
    methodName?: string;
    repoIds?: string[];
    limit?: number;
  }): Promise<ResolveSymbolsResult> {
    return this.request<ResolveSymbolsResult>('/internal/symbols/resolve', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async *resolveSymbolsStream(input: {
    query: string;
    className?: string;
    methodName?: string;
    repoIds?: string[];
    limit?: number;
  }): AsyncGenerator<StreamEvent, void, unknown> {
    const url = `${this.activeBaseUrl}/internal/symbols/resolve-stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new ApplicationError(
        `Core symbol resolve stream failed: ${response.status} ${response.statusText}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApplicationError('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('event:')) {
            const event = trimmed.slice(6).trim();
            // 读取下一行的 data
            const nextLine = lines.shift();
            if (nextLine && nextLine.startsWith('data:')) {
              const dataStr = nextLine.slice(5).trim();
              try {
                const data = JSON.parse(dataStr);
                yield { event: event as StreamEventType, data };
              } catch (e) {
                console.warn('Failed to parse SSE data:', dataStr);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async indexKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string }> {
    return this.request('/internal/knowledge/index', {
      method: 'POST',
      body: JSON.stringify({ docId }),
    });
  }

  async removeKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string; removed: boolean }> {
    return this.request('/internal/knowledge/remove', {
      method: 'POST',
      body: JSON.stringify({ docId }),
    });
  }

  async buildDocContext(repoIds: string[]): Promise<DocContextResult> {
    return this.request('/internal/repos/doc-context', {
      method: 'POST',
      body: JSON.stringify({ repoIds }),
    }, 180_000);
  }

  async buildArchContext(repoId: string): Promise<ArchContextResult> {
    return this.request('/internal/repos/arch-context', {
      method: 'POST',
      body: JSON.stringify({ repoId }),
    }, 180_000);
  }

  async generateArchDraft(repoId: string): Promise<{ snapshotId: string }> {
    return this.request(`/internal/architecture/${repoId}/generate-draft`, {
      method: 'POST',
    });
  }
}

export class CoreHttpClientStub implements CoreHttpClient {
  async testConnection(): Promise<TestConnectionResult> {
    return {
      ok: true,
      languageSummary: { TypeScript: 60, Go: 40 },
      lastCommitAt: new Date().toISOString(),
      lastCommitSummary: 'feat: initial commit',
    };
  }

  async enqueueIndex(repoId: string): Promise<EnqueueIndexResult> {
    return { jobId: `job_${repoId.slice(0, 8)}`, status: 'queued' };
  }

  async removeIndex(repoId: string): Promise<RemoveIndexResult> {
    return { repoId, removed: true };
  }

  async search(query: string): Promise<SearchHit[]> {
    return [
      {
        type: 'doc',
        title: 'Mock 文档',
        snippet: `与「${query}」相关的示例内容`,
        ref: 'doc-mock-1',
      },
    ];
  }

  async resolveSymbols(input: {
    query: string;
    className?: string;
    methodName?: string;
  }): Promise<ResolveSymbolsResult> {
    const method = input.methodName ?? 'rollback';
    const className = input.className ?? 'OrderService';
    return {
      locations: [
        {
          repoId: 'mock-repo',
          repoName: 'payment-service',
          repoUrl: 'https://example.com/payment.git',
          filePath: 'src/order/service.go',
          className,
          methodName: method,
          startLine: 142,
          endLine: 168,
          docComment: '回滚订单状态到上一个快照',
          qualifiedRef: `order.${className}#${method}`,
          snippet: `function_declaration ${method}`,
        },
      ],
    };
  }

  async indexKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string }> {
    return { ok: true, docId };
  }

  async removeKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string; removed: boolean }> {
    return { ok: true, docId, removed: true };
  }

  async buildDocContext(repoIds: string[]): Promise<DocContextResult> {
    return {
      repos: repoIds.map((repoId) => ({
        repoId,
        repoName: `Mock Repo ${repoId.slice(0, 8)}`,
        url: `https://example.com/${repoId}.git`,
        directoryTree: '.\n├── src/\n└── README.md',
        fileContents: [
          {
            path: 'README.md',
            kind: 'readme',
            content: '# Mock Project\n\n示例业务系统，用于本地开发。',
          },
        ],
      })),
      contextText: repoIds.map((id) => `## 仓库 Mock ${id}\n\n示例上下文`).join('\n\n'),
    };
  }

  async buildArchContext(repoId: string): Promise<ArchContextResult> {
    return {
      repoId,
      repoName: `Mock Repo ${repoId.slice(0, 8)}`,
      url: `https://example.com/${repoId}.git`,
      contextText: `## 仓库 Mock ${repoId}\n\n### 目录结构\n\`\`\`\n.\n├── src/\n└── README.md\n\`\`\``,
    };
  }

  async generateArchDraft(repoId: string): Promise<{ snapshotId: string }> {
    return { snapshotId: `snap_${repoId.slice(0, 8)}` };
  }
}

export function resolveCoreHttpBaseUrls(): string[] {
  if (process.env.CORE_HTTP_URL) {
    return [process.env.CORE_HTTP_URL.replace(/\/$/, '')];
  }
  const primary = `http://localhost:${process.env.CORE_HTTP_PORT ?? '8080'}`;
  const urls = [primary];
  if (!process.env.CORE_HTTP_PORT || process.env.CORE_HTTP_PORT === '8080') {
    urls.push('http://localhost:18080');
  }
  return [...new Set(urls)];
}

export function createCoreHttpClient(baseUrls?: string | string[]): CoreHttpClient {
  if (process.env.CORE_HTTP_STUB === 'true') {
    return new CoreHttpClientStub();
  }
  const urls = baseUrls
    ? Array.isArray(baseUrls)
      ? baseUrls
      : [baseUrls]
    : resolveCoreHttpBaseUrls();
  return new CoreHttpClientImpl(urls);
}
