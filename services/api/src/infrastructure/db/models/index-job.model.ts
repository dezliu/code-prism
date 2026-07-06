import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type IndexJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export class IndexJobModel extends BaseModel {
  static tableName = 'index_jobs';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  repoId!: string;
  status!: IndexJobStatus;
  errorMessage!: string | null;
  startedAt!: Date | null;
  completedAt!: Date | null;
  createdAt!: Date;
}
