import type { ApiConfig } from '../../config.js';
import { ApplicationError } from '../../domain/errors.js';

function isAiWorkerUnreachable(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  if (err.message === 'fetch failed') {
    return true;
  }
  const cause = 'cause' in err ? (err.cause as NodeJS.ErrnoException | undefined) : undefined;
  return cause?.code === 'ECONNREFUSED' || cause?.code === 'ENOTFOUND';
}

function wrapAiWorkerFetchError(config: ApiConfig, err: unknown): never {
  if (isAiWorkerUnreachable(err)) {
    throw new ApplicationError(
      `AI Worker 服务未启动（无法连接 ${config.aiWorkerUrl}）。请运行: cd services/ai-worker && source .venv/bin/activate && lingprism-ai-http`,
      'SERVICE_UNAVAILABLE',
      err,
    );
  }
  throw err instanceof Error ? err : new Error(String(err));
}

export interface ArchAnalyzeRequest {
  repoName: string;
  repoId: string;
  url: string;
  context: string;
  officialSummary?: string;
}

export interface ArchGenerateGraphRequest {
  repoName: string;
  analysis: string;
  context: string;
}

export interface ArchRepairRequest {
  errors: string[];
  badJson: string;
  analysis: string;
}

export interface AiWorkerArchClient {
  analyzeArch(request: ArchAnalyzeRequest): Promise<string>;
  generateArchGraph(request: ArchGenerateGraphRequest): Promise<string>;
  repairArchGraph(request: ArchRepairRequest): Promise<string>;
}

export class AiWorkerHttpArchClient implements AiWorkerArchClient {
  constructor(private readonly config: ApiConfig) {}

  private async postJson<T>(path: string, body: unknown, timeoutMs = 300_000): Promise<T> {
    const url = `${this.config.aiWorkerUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`ai-worker arch request failed (${response.status}): ${text}`);
      }
      return (await response.json()) as T;
    } catch (err) {
      wrapAiWorkerFetchError(this.config, err);
    } finally {
      clearTimeout(timer);
    }
  }

  async analyzeArch(request: ArchAnalyzeRequest): Promise<string> {
    const result = await this.postJson<{ analysis: string }>('/internal/arch/analyze', {
      repoName: request.repoName,
      repoId: request.repoId,
      url: request.url,
      context: request.context,
      officialSummary: request.officialSummary ?? '',
    });
    return result.analysis;
  }

  async generateArchGraph(request: ArchGenerateGraphRequest): Promise<string> {
    const result = await this.postJson<{ content: string }>('/internal/arch/generate-graph', {
      repoName: request.repoName,
      analysis: request.analysis,
      context: request.context,
    });
    return result.content;
  }

  async repairArchGraph(request: ArchRepairRequest): Promise<string> {
    const result = await this.postJson<{ content: string }>('/internal/arch/repair', {
      errors: request.errors,
      badJson: request.badJson,
      analysis: request.analysis,
    });
    return result.content;
  }
}

export class MockAiWorkerArchClient implements AiWorkerArchClient {
  async analyzeArch(request: ArchAnalyzeRequest): Promise<string> {
    return `## 分析\n\n仓库 ${request.repoName} 的 Mock 架构分析。`;
  }

  async generateArchGraph(request: ArchGenerateGraphRequest): Promise<string> {
    const slug = request.repoName.toLowerCase().replace(/\s+/g, '-').slice(0, 12) || 'app';
    return JSON.stringify({
      nodes: [
        { id: `${slug}-api`, label: `${request.repoName} API`, type: 'service' },
        { id: `${slug}-db`, label: '主数据库', type: 'database' },
      ],
      edges: [
        { id: 'e1', source: `${slug}-api`, target: `${slug}-db`, label: 'SQL' },
      ],
    });
  }

  async repairArchGraph(): Promise<string> {
    return this.generateArchGraph({ repoName: 'repaired', analysis: '', context: '' });
  }
}

export function createAiWorkerArchClient(config: ApiConfig): AiWorkerArchClient {
  if (process.env.AI_WORKER_STUB === 'true') {
    return new MockAiWorkerArchClient();
  }
  return new AiWorkerHttpArchClient(config);
}
