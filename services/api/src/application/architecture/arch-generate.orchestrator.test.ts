import { describe, expect, it, vi } from 'vitest';
import { generateArchDraftEvents } from './arch-generate.orchestrator.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerArchClient } from '../../infrastructure/clients/ai-worker-arch.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { GraphSnapshotRepository } from '../../infrastructure/db/repositories/graph-snapshot.repository.js';
import type { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';

const validGraphJson = JSON.stringify({
  nodes: [
    { id: 'api', label: 'API', type: 'service' },
    { id: 'db', label: 'DB', type: 'database' },
  ],
  edges: [{ id: 'e1', source: 'api', target: 'db', label: 'SQL' }],
});

function collectEvents(gen: AsyncGenerator<{ event: string; data: Record<string, unknown> }>) {
  return (async () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const event of gen) {
      events.push(event);
    }
    return events;
  })();
}

describe('generateArchDraftEvents', () => {
  const repos = {
    findById: vi.fn().mockResolvedValue({ id: 'repo-1', name: 'demo', metadata: {} }),
  } as unknown as RepoRepository;

  const monitor = {
    getOfficialArchitecture: vi.fn().mockResolvedValue(undefined),
  } as unknown as MonitorRepository;

  const snapshots = {
    insertDraft: vi.fn().mockResolvedValue({ id: 'snap-1', repoId: 'repo-1', graphData: {} }),
  } as unknown as GraphSnapshotRepository;

  const core = {
    buildArchContext: vi.fn().mockResolvedValue({
      repoId: 'repo-1',
      repoName: 'demo',
      url: 'https://example.com/demo.git',
      contextText: '## repo context',
    }),
  } as unknown as CoreHttpClient;

  const cancelStore = {
    isCancelled: vi.fn().mockResolvedValue(false),
  } as unknown as StreamCancelStore;

  it('should complete when graph json validates', async () => {
    const aiArch = {
      analyzeArch: vi.fn().mockResolvedValue('## analysis'),
      generateArchGraph: vi.fn().mockResolvedValue(validGraphJson),
      repairArchGraph: vi.fn(),
    } as unknown as AiWorkerArchClient;

    const events = await collectEvents(
      generateArchDraftEvents(
        { repos, monitor, snapshots, core, aiArch, cancelStore },
        { repoId: 'repo-1', streamId: 'stream-1' },
      ),
    );

    expect(events.some((e) => e.event === 'error')).toBe(false);
    const done = events.find((e) => e.event === 'done');
    expect(done?.data.graphData).toBeDefined();
    expect(snapshots.insertDraft).toHaveBeenCalled();
  });

  it('should retry repair when first graph is invalid', async () => {
    const aiArch = {
      analyzeArch: vi.fn().mockResolvedValue('## analysis'),
      generateArchGraph: vi.fn().mockResolvedValue('not json'),
      repairArchGraph: vi.fn().mockResolvedValue(validGraphJson),
    } as unknown as AiWorkerArchClient;

    const events = await collectEvents(
      generateArchDraftEvents(
        { repos, monitor, snapshots, core, aiArch, cancelStore },
        { repoId: 'repo-1', streamId: 'stream-1' },
      ),
    );

    expect(aiArch.repairArchGraph).toHaveBeenCalled();
    expect(events.find((e) => e.event === 'done')).toBeDefined();
  });

  it('should emit error when repo not found', async () => {
    const missingRepos = {
      findById: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepoRepository;

    const events = await collectEvents(
      generateArchDraftEvents(
        {
          repos: missingRepos,
          monitor,
          snapshots,
          core,
          aiArch: {} as AiWorkerArchClient,
          cancelStore,
        },
        { repoId: 'missing', streamId: 'stream-1' },
      ),
    );

    expect(events[0]?.event).toBe('error');
    expect(events[0]?.data.code).toBe('NOT_FOUND');
  });
});
