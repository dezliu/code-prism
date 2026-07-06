import { describe, expect, it, vi } from 'vitest';
import {
  GenerateKnowledgeDocContentUseCase,
  PublishKnowledgeDocUseCase,
  UpdateKnowledgeDocItemIndexUseCase,
  UpdateKnowledgeDocUseCase,
} from './knowledge.use-cases.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerDocClient } from '../../infrastructure/clients/ai-worker-doc.client.js';

function createMocks() {
  const item = {
    id: 'item-1',
    knowledgeBaseId: 'base-1',
    title: '测试知识库',
    status: 'draft' as const,
    docType: 'training' as const,
    content: '',
    indexedInSearch: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const base = {
    id: 'base-1',
    title: '测试知识库',
    repoIds: ['repo-1'],
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [item],
  };

  const knowledge = {
    findItemWithBase: vi.fn().mockResolvedValue({ item, base }),
    updateItem: vi.fn().mockImplementation(async (_id, patch) => ({ ...item, ...patch })),
    publishItem: vi.fn().mockImplementation(async () => ({ ...item, status: 'published' as const })),
    findBaseById: vi.fn().mockResolvedValue(base),
    updateBase: vi.fn().mockResolvedValue(base),
    setItemIndexedInSearch: vi.fn().mockResolvedValue({ ...item, indexedInSearch: true }),
    findItemById: vi.fn().mockResolvedValue(item),
  } as unknown as KnowledgeRepository;

  const repos = {
    findById: vi.fn().mockResolvedValue({
      id: 'repo-1',
      name: 'demo-repo',
      metadata: { displayName: 'Demo Repo' },
    }),
  } as unknown as RepoRepository;

  const core = {
    buildDocContext: vi.fn().mockResolvedValue({
      repos: [],
      contextText: '## 仓库：Demo Repo',
    }),
    search: vi.fn().mockResolvedValue([]),
    indexKnowledgeDoc: vi.fn().mockResolvedValue({ ok: true, docId: 'item-1' }),
    removeKnowledgeDoc: vi.fn().mockResolvedValue({ ok: true, docId: 'item-1', removed: true }),
  } as unknown as CoreHttpClient;

  const aiWorker = {
    generateDoc: vi.fn().mockResolvedValue({ content: '# 生成的文档\n\n内容' }),
  } as unknown as AiWorkerDocClient;

  return { item, base, knowledge, repos, core, aiWorker };
}

describe('GenerateKnowledgeDocContentUseCase', () => {
  it('should reject when no repos are linked', async () => {
    const { knowledge, repos, core, aiWorker, item, base } = createMocks();
    vi.mocked(knowledge.findItemWithBase).mockResolvedValueOnce({
      item,
      base: { ...base, repoIds: [] },
    });

    const useCase = new GenerateKnowledgeDocContentUseCase(knowledge, repos, core, aiWorker);
    await expect(useCase.execute('item-1')).rejects.toThrow('请先为知识库关联至少一个 Git 仓库');
  });

  it('should build context, call LLM, and update content', async () => {
    const { knowledge, repos, core, aiWorker } = createMocks();
    const useCase = new GenerateKnowledgeDocContentUseCase(knowledge, repos, core, aiWorker);

    const result = await useCase.execute('item-1');

    expect(core.buildDocContext).toHaveBeenCalledWith(['repo-1']);
    expect(aiWorker.generateDoc).toHaveBeenCalled();
    expect(knowledge.updateItem).toHaveBeenCalledWith('item-1', { content: '# 生成的文档\n\n内容' });
    expect(result.content).toBe('# 生成的文档\n\n内容');
  });
});

describe('UpdateKnowledgeDocUseCase (deprecated)', () => {
  it('should update repo associations on base', async () => {
    const { knowledge } = createMocks();
    const useCase = new UpdateKnowledgeDocUseCase(knowledge);

    const result = await useCase.execute('item-1', {
      repoIds: ['repo-1', 'repo-2'],
    });

    expect(knowledge.updateBase).toHaveBeenCalledWith('base-1', { repoIds: ['repo-1', 'repo-2'] });
    expect(result.repoIds).toEqual(['repo-1']);
  });
});

describe('PublishKnowledgeDocUseCase (deprecated)', () => {
  it('should publish without auto indexing', async () => {
    const { knowledge, core } = createMocks();
    const useCase = new PublishKnowledgeDocUseCase(knowledge);
    const result = await useCase.execute('item-1');

    expect(knowledge.publishItem).toHaveBeenCalledWith('item-1');
    expect(core.indexKnowledgeDoc).not.toHaveBeenCalled();
    expect(result.status).toBe('published');
  });
});

describe('UpdateKnowledgeDocItemIndexUseCase', () => {
  it('should index when enabled', async () => {
    const { knowledge, core } = createMocks();
    vi.mocked(knowledge.findItemWithBase).mockResolvedValueOnce({
      item: { ...createMocks().item, status: 'published' },
      base: createMocks().base,
    });
    vi.mocked(knowledge.findItemById).mockResolvedValueOnce({
      ...createMocks().item,
      status: 'published',
      indexedInSearch: true,
    });

    const useCase = new UpdateKnowledgeDocItemIndexUseCase(knowledge, core);
    await useCase.execute('item-1', true);

    expect(core.indexKnowledgeDoc).toHaveBeenCalledWith('item-1');
  });
});
