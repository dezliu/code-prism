import { describe, expect, it, vi } from 'vitest';
import {
  GenerateKnowledgeDocContentUseCase,
  UpdateKnowledgeDocUseCase,
} from './knowledge.use-cases.js';
import type { KnowledgeDocRepository } from '../../infrastructure/db/repositories/knowledge-doc.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerDocClient } from '../../infrastructure/clients/ai-worker-doc.client.js';

function createMocks() {
  const doc = {
    id: 'doc-1',
    title: '测试知识库',
    status: 'draft' as const,
    docType: 'training' as const,
    content: '',
    repoIds: ['repo-1'],
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const docs = {
    findById: vi.fn().mockResolvedValue(doc),
    update: vi.fn().mockImplementation(async (_id, patch) => ({ ...doc, ...patch })),
  } as unknown as KnowledgeDocRepository;

  const repos = {
    findById: vi.fn().mockResolvedValue({
      id: 'repo-1',
      name: 'demo-repo',
      metadata: { displayName: 'Demo Repo' },
    }),
  } as unknown as RepoRepository;

  const core = {
    search: vi.fn().mockResolvedValue([
      { type: 'code' as const, title: 'main.go', snippet: 'func main() {}', ref: 'main.go' },
    ]),
  } as unknown as CoreHttpClient;

  const aiWorker = {
    generateDoc: vi.fn().mockResolvedValue({ content: '# 生成的文档\n\n内容' }),
  } as unknown as AiWorkerDocClient;

  return { doc, docs, repos, core, aiWorker };
}

describe('GenerateKnowledgeDocContentUseCase', () => {
  it('should reject when no repos are linked', async () => {
    const { docs, repos, core, aiWorker } = createMocks();
    vi.mocked(docs.findById).mockResolvedValueOnce({
      ...createMocks().doc,
      repoIds: [],
    });

    const useCase = new GenerateKnowledgeDocContentUseCase(docs, repos, core, aiWorker);
    await expect(useCase.execute('doc-1')).rejects.toThrow('请先关联至少一个 Git 仓库');
  });

  it('should search code, call LLM, and update content', async () => {
    const { docs, repos, core, aiWorker } = createMocks();
    const useCase = new GenerateKnowledgeDocContentUseCase(docs, repos, core, aiWorker);

    const result = await useCase.execute('doc-1');

    expect(core.search).toHaveBeenCalledWith('项目结构 核心功能 接口 模块 代码', ['repo-1']);
    expect(aiWorker.generateDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '测试知识库',
        docType: 'training',
        repoNames: ['Demo Repo'],
      }),
    );
    expect(docs.update).toHaveBeenCalledWith('doc-1', { content: '# 生成的文档\n\n内容' });
    expect(result.content).toBe('# 生成的文档\n\n内容');
  });
});

describe('UpdateKnowledgeDocUseCase', () => {
  it('should update repo associations', async () => {
    const { docs } = createMocks();
    const useCase = new UpdateKnowledgeDocUseCase(docs);

    const result = await useCase.execute('doc-1', {
      repoIds: ['repo-1', 'repo-2'],
    });

    expect(docs.update).toHaveBeenCalledWith('doc-1', { repoIds: ['repo-1', 'repo-2'] });
    expect(result.repoIds).toEqual(['repo-1', 'repo-2']);
  });
});
