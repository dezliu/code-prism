import type { ApiConfig } from '../../config.js';

export interface GenerateDocInput {
  title: string;
  docType: string;
  repoNames: string[];
  context: string;
}

export interface GenerateDocResult {
  content: string;
}

export interface AiWorkerDocClient {
  generateDoc(input: GenerateDocInput): Promise<GenerateDocResult>;
}

export class AiWorkerHttpDocClient implements AiWorkerDocClient {
  constructor(private readonly config: ApiConfig) {}

  async generateDoc(input: GenerateDocInput): Promise<GenerateDocResult> {
    const url = `${this.config.aiWorkerUrl.replace(/\/$/, '')}/internal/doc/generate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        docType: input.docType,
        repoNames: input.repoNames,
        context: input.context,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ai-worker doc generate failed (${response.status}): ${body}`);
    }

    return (await response.json()) as GenerateDocResult;
  }
}

export class MockAiWorkerDocClient implements AiWorkerDocClient {
  async generateDoc(input: GenerateDocInput): Promise<GenerateDocResult> {
    const repos = input.repoNames.length ? input.repoNames.join('、') : '未关联仓库';
    return {
      content: [
        `# ${input.title}`,
        '',
        `> 关联仓库：${repos}`,
        '',
        '## 项目结构概览',
        '',
        input.context || '（暂无检索结果）',
        '',
        '## 核心功能说明',
        '',
        '（Mock 生成内容）',
      ].join('\n'),
    };
  }
}

export function createAiWorkerDocClient(config: ApiConfig): AiWorkerDocClient {
  if (process.env.AI_WORKER_STUB === 'true') {
    return new MockAiWorkerDocClient();
  }
  return new AiWorkerHttpDocClient(config);
}
