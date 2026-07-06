import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export class HealthScoreModel extends BaseModel {
  static tableName = 'health_scores';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  repoId!: string;
  score!: number;
  metrics!: Record<string, unknown>;
  calculatedAt!: Date;

  static get jsonAttributes() {
    return ['metrics'];
  }
}
