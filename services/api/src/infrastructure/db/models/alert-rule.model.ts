import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type AlertRuleType =
  | 'health_score_min'
  | 'circular_deps_max'
  | 'file_lines_max'
  | 'arch_drift';

export type AlertScope = 'global' | 'team' | 'project';

export class AlertRuleModel extends BaseModel {
  static tableName = 'alert_rules';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  name!: string;
  ruleType!: AlertRuleType;
  scope!: AlertScope;
  scopeId!: string | null;
  thresholdValue!: number;
  thresholdUnit!: string | null;
  notifyChannels!: string[];
  enabled!: boolean;
  createdBy!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
