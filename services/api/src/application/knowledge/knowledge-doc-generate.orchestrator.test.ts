import { describe, expect, it, vi } from 'vitest';
import { generateKnowledgeDocEvents } from './knowledge-doc-generate.orchestrator.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerStreamClient } from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';

describe('generateKnowledgeDocEvents', () => {
  it('should emit fetching, tokens, and done without persisting item', async () => {
    const knowledge = {
      findItemWithBase: vi.fn().mockResolvedValue({
        item: { id: 'item-1', title: '测试', docType: 'training', knowledgeBaseId: 'base-1' },
        base: { id: 'base-1', repoIds: ['repo-1'] },
      }),
      updateItem: vi.fn(),
    } as unknown as KnowledgeRepository;

    const repos = {
      findById: vi.fn().mockResolvedValue({ id: 'repo-1', name: 'demo', metadata: {} }),
    } as unknown as RepoRepository;

    const core = {
      buildDocContext: vi.fn().mockResolvedValue({ repos: [], contextText: 'ctx' }),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as CoreHttpClient;

    async function* mockStream() {
      yield { event: 'status', data: { phase: 'analyzing' } };
      yield { event: 'token', data: { text: '# Doc' } };
      yield { event: 'done', data: { content: '# Doc', interrupted: false } };
    }

    const aiWorker = {
      streamGenerateDoc: vi.fn().mockReturnValue(mockStream()),
    } as unknown as AiWorkerStreamClient;

    const cancelStore = {
      isCancelled: vi.fn().mockResolvedValue(false),
    } as unknown as StreamCancelStore;

    const phases: string[] = [];
    const events = [];
    for await (const event of generateKnowledgeDocEvents(
      { knowledge, repos, core, aiWorker, cancelStore },
      { itemId: 'item-1', streamId: 'stream-1' },
      { onPhase: (phase) => phases.push(phase) },
    )) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      event: 'status',
      data: { phase: 'fetching_code', streamId: 'stream-1' },
    });
    expect(phases).toContain('fetching_code');
    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { content: '# Doc', itemId: 'item-1' },
    });
    expect(knowledge.updateItem).not.toHaveBeenCalled();
  });
});
