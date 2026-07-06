import { randomUUID } from 'node:crypto';
import {
  ArchGenerateJobModel,
  type ArchGenerateJobPhase,
  type ArchGenerateJobStatus,
} from '../models/arch-generate-job.model.js';
import type { GraphData } from '../models/graph-snapshot.model.js';

export interface CreateArchGenerateJobInput {
  repoId: string;
  streamId: string;
  createdBy?: string;
}

export interface ListArchGenerateJobsFilter {
  status?: string;
  limit?: number;
}

const ACTIVE_STATUSES: ArchGenerateJobStatus[] = ['queued', 'running'];
const FAILED_GROUP_STATUSES: ArchGenerateJobStatus[] = ['failed', 'cancelled'];

export class ArchGenerateJobRepository {
  async findById(id: string): Promise<ArchGenerateJobModel | undefined> {
    return ArchGenerateJobModel.query().findById(id);
  }

  async hasActiveJobForRepo(repoId: string): Promise<boolean> {
    const row = await ArchGenerateJobModel.query()
      .where('repo_id', repoId)
      .whereIn('status', ACTIVE_STATUSES)
      .first();
    return Boolean(row);
  }

  async create(input: CreateArchGenerateJobInput): Promise<ArchGenerateJobModel> {
    const id = randomUUID();
    await ArchGenerateJobModel.query().insert({
      id,
      repoId: input.repoId,
      status: 'queued',
      phase: null,
      streamId: input.streamId,
      errorCode: null,
      errorMessage: null,
      graphData: null,
      attemptCount: 0,
      createdBy: input.createdBy ?? null,
      startedAt: null,
      completedAt: null,
    });
    return ArchGenerateJobModel.query().findById(id).throwIfNotFound();
  }

  async list(filter: ListArchGenerateJobsFilter = {}): Promise<ArchGenerateJobModel[]> {
    const limit = Math.min(filter.limit ?? 50, 100);
    let query = ArchGenerateJobModel.query().orderBy('created_at', 'desc').limit(limit);

    if (filter.status === 'active') {
      query = query.whereIn('status', ACTIVE_STATUSES);
    } else if (filter.status === 'failed') {
      query = query.whereIn('status', FAILED_GROUP_STATUSES);
    } else if (filter.status) {
      query = query.where('status', filter.status as ArchGenerateJobStatus);
    }

    return query;
  }

  async markRunning(id: string, phase?: ArchGenerateJobPhase): Promise<void> {
    await ArchGenerateJobModel.query().findById(id).patch({
      status: 'running',
      ...(phase !== undefined ? { phase } : {}),
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateProgress(
    id: string,
    patch: { phase?: ArchGenerateJobPhase | null; attemptCount?: number },
  ): Promise<void> {
    await ArchGenerateJobModel.query().findById(id).patch({
      ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
      ...(patch.attemptCount !== undefined ? { attemptCount: patch.attemptCount } : {}),
      updatedAt: new Date(),
    });
  }

  async markCompleted(id: string, graphData: GraphData): Promise<void> {
    await ArchGenerateJobModel.query().findById(id).patch({
      status: 'completed',
      phase: null,
      graphData,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markFailed(id: string, errorCode: string | null, errorMessage: string): Promise<void> {
    await ArchGenerateJobModel.query().findById(id).patch({
      status: 'failed',
      phase: null,
      errorCode,
      errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markCancelled(id: string): Promise<void> {
    await ArchGenerateJobModel.query().findById(id).patch({
      status: 'cancelled',
      phase: null,
      errorMessage: '任务已取消',
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async failStaleRunningJobs(message: string): Promise<number> {
    const result = await ArchGenerateJobModel.query()
      .whereIn('status', ['queued', 'running'])
      .patch({
        status: 'failed',
        phase: null,
        errorCode: 'STALE_JOB',
        errorMessage: message,
        completedAt: new Date(),
        updatedAt: new Date(),
      });
    return result;
  }
}
