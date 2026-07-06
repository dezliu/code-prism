import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';
import type { DocType } from './knowledge-doc-item.model.js';

export type DocGenerateJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type DocGenerateJobPhase = 'fetching_code' | 'analyzing' | 'generating';

export class DocGenerateJobModel extends BaseModel {
  static tableName = 'knowledge_doc_generate_jobs';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  itemId!: string;
  knowledgeBaseId!: string;
  title!: string;
  docType!: DocType;
  status!: DocGenerateJobStatus;
  phase!: DocGenerateJobPhase | null;
  streamId!: string;
  errorCode!: string | null;
  errorMessage!: string | null;
  content!: string | null;
  createdBy!: string | null;
  startedAt!: Date | null;
  completedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
