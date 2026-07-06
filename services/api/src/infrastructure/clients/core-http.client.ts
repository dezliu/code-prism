/** Core 内部 HTTP 客户端 — Batch 5 P0 业务编排 */

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

export interface SearchHit {
  type: 'code' | 'doc' | 'repo';
  title: string;
  snippet: string;
  ref?: string;
}

export interface CoreHttpClient {
  testConnection(input: {
    url: string;
    authType: string;
    defaultBranch: string;
  }): Promise<TestConnectionResult>;
  enqueueIndex(repoId: string): Promise<EnqueueIndexResult>;
  search(query: string, repoIds?: string[]): Promise<SearchHit[]>;
  generateArchDraft(repoId: string): Promise<{ snapshotId: string }>;
}

export class CoreHttpClientImpl implements CoreHttpClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`core request failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
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

  async search(query: string, repoIds?: string[]): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q: query });
    if (repoIds?.length) {
      params.set('repoIds', repoIds.join(','));
    }
    const data = await this.request<{ hits: SearchHit[] }>(`/internal/search?${params}`);
    return data.hits;
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

  async generateArchDraft(repoId: string): Promise<{ snapshotId: string }> {
    return { snapshotId: `snap_${repoId.slice(0, 8)}` };
  }
}

export function createCoreHttpClient(baseUrl: string): CoreHttpClient {
  if (process.env.CORE_HTTP_STUB === 'true') {
    return new CoreHttpClientStub();
  }
  return new CoreHttpClientImpl(baseUrl);
}
