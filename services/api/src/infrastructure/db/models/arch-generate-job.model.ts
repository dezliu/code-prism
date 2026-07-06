import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';
import type { GraphData } from './graph-snapshot.model.js';

export type ArchGenerateJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ArchGenerateJobPhase =
  | 'fetching_code'
  | 'analyzing'
  | 'generating'
  | 'validating'
  | 'repairing';

export class ArchGenerateJobModel extends BaseModel {
  static tableName = 'arch_generate_jobs';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  repoId!: string;
  status!: ArchGenerateJobStatus;
  phase!: ArchGenerateJobPhase | null;
  streamId!: string;
  errorCode!: string | null;
  errorMessage!: string | null;
  graphData!: GraphData | null;
  attemptCount!: number;
  createdBy!: string | null;
  startedAt!: Date | null;
  completedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  static get jsonAttributes() {
    return ['graphData'];
  }
}
