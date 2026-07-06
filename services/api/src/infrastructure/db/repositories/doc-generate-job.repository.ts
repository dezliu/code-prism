import { randomUUID } from 'node:crypto';
import {
  DocGenerateJobModel,
  type DocGenerateJobPhase,
  type DocGenerateJobStatus,
} from '../models/doc-generate-job.model.js';
import type { DocType } from '../models/knowledge-doc-item.model.js';

export interface CreateDocGenerateJobInput {
  itemId: string;
  knowledgeBaseId: string;
  title: string;
  docType: DocType;
  streamId: string;
  createdBy?: string;
}

export interface ListDocGenerateJobsFilter {
  status?: string;
  limit?: number;
}

const ACTIVE_STATUSES: DocGenerateJobStatus[] = ['queued', 'running'];
const FAILED_GROUP_STATUSES: DocGenerateJobStatus[] = ['failed', 'cancelled'];

export class DocGenerateJobRepository {
  async findById(id: string): Promise<DocGenerateJobModel | undefined> {
    return DocGenerateJobModel.query().findById(id);
  }

  async hasActiveJobForItem(itemId: string): Promise<boolean> {
    const row = await DocGenerateJobModel.query()
      .where('item_id', itemId)
      .whereIn('status', ACTIVE_STATUSES)
      .first();
    return Boolean(row);
  }

  async create(input: CreateDocGenerateJobInput): Promise<DocGenerateJobModel> {
    const id = randomUUID();
    await DocGenerateJobModel.query().insert({
      id,
      itemId: input.itemId,
      knowledgeBaseId: input.knowledgeBaseId,
      title: input.title.trim(),
      docType: input.docType,
      status: 'queued',
      phase: null,
      streamId: input.streamId,
      errorCode: null,
      errorMessage: null,
      content: null,
      createdBy: input.createdBy ?? null,
      startedAt: null,
      completedAt: null,
    });
    return DocGenerateJobModel.query().findById(id).throwIfNotFound();
  }

  async list(filter: ListDocGenerateJobsFilter = {}): Promise<DocGenerateJobModel[]> {
    const limit = Math.min(filter.limit ?? 50, 100);
    let query = DocGenerateJobModel.query().orderBy('created_at', 'desc').limit(limit);

    if (filter.status === 'active') {
      query = query.whereIn('status', ACTIVE_STATUSES);
    } else if (filter.status === 'failed') {
      query = query.whereIn('status', FAILED_GROUP_STATUSES);
    } else if (filter.status) {
      query = query.where('status', filter.status as DocGenerateJobStatus);
    }

    return query;
  }

  async markRunning(id: string, phase?: DocGenerateJobPhase): Promise<void> {
    await DocGenerateJobModel.query().findById(id).patch({
      status: 'running',
      ...(phase !== undefined ? { phase } : {}),
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async updateProgress(
    id: string,
    patch: { phase?: DocGenerateJobPhase | null; content?: string },
  ): Promise<void> {
    await DocGenerateJobModel.query().findById(id).patch({
      ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      updatedAt: new Date(),
    });
  }

  async markCompleted(id: string, content: string): Promise<void> {
    await DocGenerateJobModel.query().findById(id).patch({
      status: 'completed',
      phase: null,
      content,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markFailed(id: string, errorCode: string | null, errorMessage: string): Promise<void> {
    await DocGenerateJobModel.query().findById(id).patch({
      status: 'failed',
      phase: null,
      errorCode,
      errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async markCancelled(id: string): Promise<void> {
    await DocGenerateJobModel.query().findById(id).patch({
      status: 'cancelled',
      phase: null,
      errorMessage: '任务已取消',
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async failStaleRunningJobs(message: string): Promise<number> {
    const result = await DocGenerateJobModel.query()
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
