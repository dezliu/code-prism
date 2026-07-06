import { randomUUID } from 'node:crypto';
import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerStreamClient } from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { DocGenerateJobModel } from '../../infrastructure/db/models/doc-generate-job.model.js';
import type { DocType } from '../../infrastructure/db/models/knowledge-doc-item.model.js';
import { DocGenerateJobRepository } from '../../infrastructure/db/repositories/doc-generate-job.repository.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import { generateKnowledgeDocEvents, type DocGeneratePhase } from './knowledge-doc-generate.orchestrator.js';

export interface DocGenerateJobSummary {
  id: string;
  itemId: string;
  itemTitle: string;
  knowledgeBaseId: string;
  knowledgeBaseTitle: string | null;
  title: string;
  docType: string;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  content: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function toJobSummary(
  job: DocGenerateJobModel,
  itemTitle: string,
  knowledgeBaseTitle: string | null,
): DocGenerateJobSummary {
  return {
    id: job.id,
    itemId: job.itemId,
    itemTitle,
    knowledgeBaseId: job.knowledgeBaseId,
    knowledgeBaseTitle,
    title: job.title,
    docType: job.docType,
    status: job.status,
    phase: job.phase,
    errorMessage: job.errorMessage,
    content: job.content,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

async function resolveJobSummary(
  jobs: DocGenerateJobRepository,
  knowledge: KnowledgeRepository,
  job: DocGenerateJobModel,
): Promise<DocGenerateJobSummary> {
  const pair = await knowledge.findItemWithBase(job.itemId);
  const itemTitle = pair?.item.title ?? job.title;
  const knowledgeBaseTitle = pair?.base.title ?? null;
  return toJobSummary(job, itemTitle, knowledgeBaseTitle);
}

export class RunDocGenerateJobUseCase {
  constructor(
    private readonly jobs: DocGenerateJobRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerStreamClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async execute(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job || (job.status !== 'queued' && job.status !== 'running')) {
      return;
    }

    await this.jobs.markRunning(jobId, 'fetching_code');

    let lastContentFlush = Date.now();
    const flushIntervalMs = 2000;

    const flushContent = async (content: string) => {
      const now = Date.now();
      if (now - lastContentFlush >= flushIntervalMs) {
        await this.jobs.updateProgress(jobId, { content });
        lastContentFlush = now;
      }
    };

    try {
      for await (const event of generateKnowledgeDocEvents(
        {
          knowledge: this.knowledge,
          repos: this.repos,
          core: this.core,
          aiWorker: this.aiWorker,
          cancelStore: this.cancelStore,
        },
        {
          itemId: job.itemId,
          streamId: job.streamId,
          title: job.title,
          docType: job.docType,
        },
        {
          onPhase: async (phase: DocGeneratePhase) => {
            await this.jobs.updateProgress(jobId, { phase });
          },
          onToken: async (_text, accumulated) => {
            await flushContent(accumulated);
          },
        },
      )) {
        if (event.event === 'token') {
          continue;
        }

        if (event.event === 'status') {
          continue;
        }

        if (event.event === 'error') {
          await this.jobs.markFailed(
            jobId,
            String(event.data.code ?? 'GENERATE_FAILED'),
            String(event.data.message ?? '文档生成失败'),
          );
          return;
        }

        if (event.event === 'done') {
          if (event.data.interrupted) {
            await this.jobs.markCancelled(jobId);
            return;
          }
          const finalContent = String(event.data.content ?? '');
          await this.jobs.markCompleted(jobId, finalContent);
          return;
        }
      }

      await this.jobs.markFailed(jobId, 'GENERATE_FAILED', '文档生成未正常结束');
    } catch (error) {
      await this.jobs.markFailed(
        jobId,
        error instanceof ApplicationError ? error.code : 'GENERATE_FAILED',
        error instanceof Error ? error.message : '文档生成失败',
      );
    }
  }
}

export class EnqueueDocGenerateJobUseCase {
  constructor(
    private readonly jobs: DocGenerateJobRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly runJob: RunDocGenerateJobUseCase,
  ) {}

  async execute(input: {
    itemId: string;
    title?: string;
    docType?: string;
    createdBy?: string;
  }): Promise<DocGenerateJobSummary> {
    const pair = await this.knowledge.findItemWithBase(input.itemId);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', input.itemId);
    }
    if (!pair.base.repoIds?.length) {
      throw new ApplicationError('请先为知识库关联至少一个 Git 仓库', 'VALIDATION_ERROR');
    }

    if (await this.jobs.hasActiveJobForItem(input.itemId)) {
      throw new ApplicationError('该文档已有进行中的生成任务', 'JOB_ALREADY_RUNNING');
    }

    const title = input.title?.trim() || pair.item.title;
    const docType = (input.docType || pair.item.docType) as DocType;

    if (input.title !== undefined || input.docType !== undefined) {
      await this.knowledge.updateItem(input.itemId, {
        ...(input.title !== undefined ? { title } : {}),
        ...(input.docType !== undefined ? { docType } : {}),
      });
    }

    const streamId = randomUUID();
    const job = await this.jobs.create({
      itemId: input.itemId,
      knowledgeBaseId: pair.base.id,
      title,
      docType,
      streamId,
      createdBy: input.createdBy,
    });

    void this.runJob.execute(job.id);

    return toJobSummary(job, pair.item.title, pair.base.title);
  }
}

export class ListDocGenerateJobsUseCase {
  constructor(
    private readonly jobs: DocGenerateJobRepository,
    private readonly knowledge: KnowledgeRepository,
  ) {}

  async execute(filter?: { status?: string; limit?: number }): Promise<DocGenerateJobSummary[]> {
    const rows = await this.jobs.list(filter);
    return Promise.all(rows.map((job) => resolveJobSummary(this.jobs, this.knowledge, job)));
  }
}

export class GetDocGenerateJobUseCase {
  constructor(
    private readonly jobs: DocGenerateJobRepository,
    private readonly knowledge: KnowledgeRepository,
  ) {}

  async execute(id: string): Promise<DocGenerateJobSummary> {
    const job = await this.jobs.findById(id);
    if (!job) {
      throw new NotFoundError('DocGenerateJob', id);
    }
    return resolveJobSummary(this.jobs, this.knowledge, job);
  }
}

export class CancelDocGenerateJobUseCase {
  constructor(
    private readonly jobs: DocGenerateJobRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async execute(id: string): Promise<DocGenerateJobSummary> {
    const job = await this.jobs.findById(id);
    if (!job) {
      throw new NotFoundError('DocGenerateJob', id);
    }
    if (job.status !== 'queued' && job.status !== 'running') {
      throw new ApplicationError('只能取消进行中的任务', 'VALIDATION_ERROR');
    }

    await this.cancelStore.requestCancel(job.streamId);
    await this.jobs.markCancelled(id);
    const updated = (await this.jobs.findById(id))!;
    return resolveJobSummary(this.jobs, this.knowledge, updated);
  }
}

export class ApplyDocGenerateJobUseCase {
  constructor(
    private readonly jobs: DocGenerateJobRepository,
    private readonly knowledge: KnowledgeRepository,
  ) {}

  async execute(jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (!job) {
      throw new NotFoundError('DocGenerateJob', jobId);
    }
    if (job.status !== 'completed' || !job.content) {
      throw new ApplicationError('只能应用已完成的生成任务', 'VALIDATION_ERROR');
    }

    const pair = await this.knowledge.findItemWithBase(job.itemId);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', job.itemId);
    }

    const updated = await this.knowledge.updateItem(job.itemId, { content: job.content });
    return {
      id: updated.id,
      knowledgeBaseId: updated.knowledgeBaseId,
      title: updated.title,
      status: updated.status,
      docType: updated.docType,
      indexedInSearch: updated.indexedInSearch,
      content: updated.content,
      repoIds: pair.base.repoIds,
    };
  }
}

export class FailStaleDocGenerateJobsUseCase {
  constructor(private readonly jobs: DocGenerateJobRepository) {}

  async execute(): Promise<number> {
    return this.jobs.failStaleRunningJobs('服务重启，请重新生成');
  }
}
