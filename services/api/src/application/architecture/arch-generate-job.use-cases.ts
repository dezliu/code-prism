import { randomUUID } from 'node:crypto';
import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerArchClient } from '../../infrastructure/clients/ai-worker-arch.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { ArchGenerateJobModel } from '../../infrastructure/db/models/arch-generate-job.model.js';
import type { GraphData } from '../../infrastructure/db/models/graph-snapshot.model.js';
import { ArchGenerateJobRepository } from '../../infrastructure/db/repositories/arch-generate-job.repository.js';
import type { GraphSnapshotRepository } from '../../infrastructure/db/repositories/graph-snapshot.repository.js';
import type { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import {
  generateArchDraftEvents,
  type ArchGeneratePhase,
} from './arch-generate.orchestrator.js';

export interface ArchGenerateJobSummary {
  id: string;
  repoId: string;
  repoName: string | null;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  graphData: GraphData | null;
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function toJobSummary(
  job: ArchGenerateJobModel,
  repoName: string | null,
): ArchGenerateJobSummary {
  return {
    id: job.id,
    repoId: job.repoId,
    repoName,
    status: job.status,
    phase: job.phase,
    errorMessage: job.errorMessage,
    graphData: job.graphData,
    attemptCount: job.attemptCount,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

async function resolveRepoName(repos: RepoRepository, repoId: string): Promise<string | null> {
  const repo = await repos.findById(repoId);
  if (!repo) {
    return null;
  }
  const meta = repo.metadata as { displayName?: string } | undefined;
  return meta?.displayName ?? repo.name ?? null;
}

async function resolveJobSummary(
  jobs: ArchGenerateJobRepository,
  repos: RepoRepository,
  job: ArchGenerateJobModel,
): Promise<ArchGenerateJobSummary> {
  const repoName = await resolveRepoName(repos, job.repoId);
  return toJobSummary(job, repoName);
}

export class RunArchGenerateJobUseCase {
  constructor(
    private readonly jobs: ArchGenerateJobRepository,
    private readonly repos: RepoRepository,
    private readonly monitor: MonitorRepository,
    private readonly snapshots: GraphSnapshotRepository,
    private readonly core: CoreHttpClient,
    private readonly aiArch: AiWorkerArchClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async execute(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job || (job.status !== 'queued' && job.status !== 'running')) {
      return;
    }

    await this.jobs.markRunning(jobId, 'fetching_code');

    try {
      for await (const event of generateArchDraftEvents(
        {
          repos: this.repos,
          monitor: this.monitor,
          snapshots: this.snapshots,
          core: this.core,
          aiArch: this.aiArch,
          cancelStore: this.cancelStore,
        },
        { repoId: job.repoId, streamId: job.streamId },
        {
          onPhase: async (phase: ArchGeneratePhase, attempt?: number) => {
            await this.jobs.updateProgress(jobId, {
              phase,
              ...(attempt !== undefined ? { attemptCount: attempt } : {}),
            });
          },
        },
      )) {
        if (event.event === 'status') {
          continue;
        }

        if (event.event === 'error') {
          await this.jobs.markFailed(
            jobId,
            String(event.data.code ?? 'GENERATE_FAILED'),
            String(event.data.message ?? '架构图生成失败'),
          );
          return;
        }

        if (event.event === 'done') {
          if (event.data.interrupted) {
            await this.jobs.markCancelled(jobId);
            return;
          }
          const graphData = event.data.graphData as GraphData;
          await this.jobs.markCompleted(jobId, graphData);
          return;
        }
      }

      await this.jobs.markFailed(jobId, 'GENERATE_FAILED', '架构图生成未正常结束');
    } catch (error) {
      await this.jobs.markFailed(
        jobId,
        error instanceof ApplicationError ? error.code : 'GENERATE_FAILED',
        error instanceof Error ? error.message : '架构图生成失败',
      );
    }
  }
}

export class EnqueueArchGenerateJobUseCase {
  constructor(
    private readonly jobs: ArchGenerateJobRepository,
    private readonly repos: RepoRepository,
    private readonly runJob: RunArchGenerateJobUseCase,
  ) {}

  async execute(input: { repoId: string; createdBy?: string }): Promise<ArchGenerateJobSummary> {
    const repo = await this.repos.findById(input.repoId);
    if (!repo) {
      throw new NotFoundError('Repo', input.repoId);
    }

    if (await this.jobs.hasActiveJobForRepo(input.repoId)) {
      throw new ApplicationError('该代码库已有进行中的架构图生成任务', 'JOB_ALREADY_RUNNING');
    }

    const streamId = randomUUID();
    const job = await this.jobs.create({
      repoId: input.repoId,
      streamId,
      createdBy: input.createdBy,
    });

    void this.runJob.execute(job.id);

    const repoName = await resolveRepoName(this.repos, input.repoId);
    return toJobSummary(job, repoName);
  }
}

export class ListArchGenerateJobsUseCase {
  constructor(
    private readonly jobs: ArchGenerateJobRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(filter?: { status?: string; limit?: number }): Promise<ArchGenerateJobSummary[]> {
    const rows = await this.jobs.list(filter);
    return Promise.all(rows.map((job) => resolveJobSummary(this.jobs, this.repos, job)));
  }
}

export class GetArchGenerateJobUseCase {
  constructor(
    private readonly jobs: ArchGenerateJobRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(id: string): Promise<ArchGenerateJobSummary> {
    const job = await this.jobs.findById(id);
    if (!job) {
      throw new NotFoundError('ArchGenerateJob', id);
    }
    return resolveJobSummary(this.jobs, this.repos, job);
  }
}

export class CancelArchGenerateJobUseCase {
  constructor(
    private readonly jobs: ArchGenerateJobRepository,
    private readonly repos: RepoRepository,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async execute(id: string): Promise<ArchGenerateJobSummary> {
    const job = await this.jobs.findById(id);
    if (!job) {
      throw new NotFoundError('ArchGenerateJob', id);
    }
    if (job.status !== 'queued' && job.status !== 'running') {
      throw new ApplicationError('只能取消进行中的任务', 'VALIDATION_ERROR');
    }

    await this.cancelStore.requestCancel(job.streamId);
    await this.jobs.markCancelled(id);
    const updated = (await this.jobs.findById(id))!;
    return resolveJobSummary(this.jobs, this.repos, updated);
  }
}

export class FailStaleArchGenerateJobsUseCase {
  constructor(private readonly jobs: ArchGenerateJobRepository) {}

  async execute(): Promise<number> {
    return this.jobs.failStaleRunningJobs('服务重启，请重新生成');
  }
}
