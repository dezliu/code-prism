import { describe, expect, it, vi } from 'vitest';
import { StreamGenerateKnowledgeDocUseCase } from './knowledge-doc-stream.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerStreamClient } from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';

describe('StreamGenerateKnowledgeDocUseCase', () => {
  it('should emit fetching, tokens, save content, and done', async () => {
    const knowledge = {
      findItemWithBase: vi.fn().mockResolvedValue({
        item: {
          id: 'item-1',
          title: '测试',
          docType: 'training',
          knowledgeBaseId: 'base-1',
        },
        base: {
          id: 'base-1',
          repoIds: ['repo-1'],
        },
      }),
      updateItem: vi.fn().mockResolvedValue({}),
    } as unknown as KnowledgeRepository;

    const repos = {
      findById: vi.fn().mockResolvedValue({
        id: 'repo-1',
        name: 'demo',
        metadata: { displayName: 'Demo' },
      }),
    } as unknown as RepoRepository;

    const core = {
      buildDocContext: vi.fn().mockResolvedValue({
        repos: [],
        contextText: '## repo context',
      }),
    } as unknown as CoreHttpClient;

    async function* mockStream() {
      yield { event: 'status', data: { phase: 'analyzing' } };
      yield { event: 'status', data: { phase: 'generating' } };
      yield { event: 'token', data: { text: '# Hello' } };
      yield { event: 'done', data: { content: '# Hello', interrupted: false } };
    }

    const aiWorker = {
      streamGenerateDoc: vi.fn().mockReturnValue(mockStream()),
    } as unknown as AiWorkerStreamClient;

    const cancelStore = {
      isCancelled: vi.fn().mockResolvedValue(false),
      requestCancel: vi.fn(),
    } as unknown as StreamCancelStore;

    const useCase = new StreamGenerateKnowledgeDocUseCase(knowledge, repos, core, aiWorker, cancelStore);
    const events = [];
    for await (const event of useCase.execute({ itemId: 'item-1', streamId: 'stream-1' })) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      event: 'status',
      data: { phase: 'fetching_code', streamId: 'stream-1' },
    });
    expect(events.some((e) => e.event === 'token')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { itemId: 'item-1', content: '# Hello', interrupted: false },
    });
    expect(knowledge.updateItem).toHaveBeenCalledWith('item-1', { content: '# Hello' });
  });
});
