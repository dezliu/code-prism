import { describe, expect, it, vi } from 'vitest';
import {
  EnqueueDocGenerateJobUseCase,
  ApplyDocGenerateJobUseCase,
  type RunDocGenerateJobUseCase,
} from './doc-generate-job.use-cases.js';
import type { DocGenerateJobRepository } from '../../infrastructure/db/repositories/doc-generate-job.repository.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';

describe('EnqueueDocGenerateJobUseCase', () => {
  it('should reject duplicate active jobs for same item', async () => {
    const jobs = {
      hasActiveJobForItem: vi.fn().mockResolvedValue(true),
    } as unknown as DocGenerateJobRepository;

    const knowledge = {
      findItemWithBase: vi.fn().mockResolvedValue({
        item: { id: 'item-1', title: 'T', docType: 'training' },
        base: { id: 'base-1', title: 'Base', repoIds: ['repo-1'] },
      }),
    } as unknown as KnowledgeRepository;

    const runJob = { execute: vi.fn() } as unknown as RunDocGenerateJobUseCase;
    const useCase = new EnqueueDocGenerateJobUseCase(jobs, knowledge, runJob);

    await expect(useCase.execute({ itemId: 'item-1' })).rejects.toThrow('已有进行中的生成任务');
  });

  it('should enqueue and start background job', async () => {
    const jobs = {
      hasActiveJobForItem: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue({
        id: 'job-1',
        itemId: 'item-1',
        knowledgeBaseId: 'base-1',
        title: 'T',
        docType: 'training',
        status: 'queued',
        phase: null,
        errorMessage: null,
        content: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
      }),
    } as unknown as DocGenerateJobRepository;

    const knowledge = {
      findItemWithBase: vi.fn().mockResolvedValue({
        item: { id: 'item-1', title: 'T', docType: 'training' },
        base: { id: 'base-1', title: 'Base', repoIds: ['repo-1'] },
      }),
      updateItem: vi.fn(),
    } as unknown as KnowledgeRepository;

    const runJob = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as RunDocGenerateJobUseCase;
    const useCase = new EnqueueDocGenerateJobUseCase(jobs, knowledge, runJob);

    const result = await useCase.execute({ itemId: 'item-1', createdBy: 'user-1' });
    expect(result.id).toBe('job-1');
    expect(jobs.create).toHaveBeenCalled();
    expect(runJob.execute).toHaveBeenCalledWith('job-1');
  });
});

describe('ApplyDocGenerateJobUseCase', () => {
  it('should write job content to knowledge doc item', async () => {
    const jobs = {
      findById: vi.fn().mockResolvedValue({
        id: 'job-1',
        itemId: 'item-1',
        status: 'completed',
        content: '# Generated',
      }),
    } as unknown as DocGenerateJobRepository;

    const knowledge = {
      findItemWithBase: vi.fn().mockResolvedValue({
        item: { id: 'item-1' },
        base: { repoIds: ['repo-1'] },
      }),
      updateItem: vi.fn().mockResolvedValue({
        id: 'item-1',
        knowledgeBaseId: 'base-1',
        title: 'T',
        status: 'draft',
        docType: 'training',
        indexedInSearch: false,
        content: '# Generated',
      }),
    } as unknown as KnowledgeRepository;

    const useCase = new ApplyDocGenerateJobUseCase(jobs, knowledge);
    const result = await useCase.execute('job-1');
    expect(knowledge.updateItem).toHaveBeenCalledWith('item-1', { content: '# Generated' });
    expect(result.content).toBe('# Generated');
  });
});
