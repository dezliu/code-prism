import type { ApiConfig } from '../../config.js';
import { ApplicationError } from '../../domain/errors.js';

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
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          docType: input.docType,
          repoNames: input.repoNames,
          context: input.context,
        }),
      });
    } catch (err) {
      const cause = err instanceof Error && 'cause' in err ? (err.cause as NodeJS.ErrnoException | undefined) : undefined;
      if (cause?.code === 'ECONNREFUSED') {
        throw new ApplicationError(
          `AI Worker 服务未启动（无法连接 ${this.config.aiWorkerUrl}）。请运行: cd services/ai-worker && source .venv/bin/activate && lingprism-ai-http`,
          'SERVICE_UNAVAILABLE',
          err,
        );
      }
      throw err;
    }

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
    const sectionMap: Record<string, string[]> = {
      design: ['系统简介', '系统功能', '系统架构设计', '表设计', '对外提供服务', '具体业务信息'],
      training: ['培训目标与学习路径', '系统概览', '环境准备与快速启动', '核心功能实操指南', '代码导读', '常见问题与 FAQ'],
      ops: ['系统运行概览', '部署架构与环境', '配置与密钥管理', '监控告警与日志', '发布与回滚流程', '故障排查与应急预案'],
      adr: ['背景与问题陈述', '决策驱动因素与约束', '候选方案对比', '最终决策与理由', '影响范围与落地事项', '风险与后续跟进'],
      other: ['文档目的与适用范围', '核心概念', '关键模块说明', '参考与延伸'],
    };
    const sections = sectionMap[input.docType] ?? sectionMap.other;
    const lines = [
      `# ${input.title}`,
      '',
      `> 文档类型：${input.docType} · 关联仓库：${repos}`,
      '',
    ];
    for (const section of sections) {
      lines.push(`## ${section}`, '', '（Mock 生成内容）', '');
    }
    return { content: lines.join('\n').trim() };
  }
}

export function createAiWorkerDocClient(config: ApiConfig): AiWorkerDocClient {
  if (process.env.AI_WORKER_STUB === 'true') {
    return new MockAiWorkerDocClient();
  }
  return new AiWorkerHttpDocClient(config);
}
