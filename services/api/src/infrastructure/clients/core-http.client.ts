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

export interface CoreHttpClient {
  testConnection(input: {
    url: string;
    authType: string;
    defaultBranch: string;
  }): Promise<TestConnectionResult>;
  enqueueIndex(repoId: string): Promise<EnqueueIndexResult>;
  removeIndex(repoId: string): Promise<RemoveIndexResult>;
  search(query: string, repoIds?: string[]): Promise<SearchHit[]>;
  indexKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string }>;
  buildDocContext(repoIds: string[]): Promise<DocContextResult>;
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

  async indexKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string }> {
    return this.request('/internal/knowledge/index', {
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

  async indexKnowledgeDoc(docId: string): Promise<{ ok: boolean; docId: string }> {
    return { ok: true, docId };
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
