import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type DriftStatus = 'open' | 'resolved' | 'ignored';

export class ArchDriftModel extends BaseModel {
  static tableName = 'arch_drift_records';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  repoId!: string;
  description!: string;
  driftType!: string;
  sourceNode!: string | null;
  targetNode!: string | null;
  status!: DriftStatus;
  detectedAt!: Date;
}
