import { randomUUID } from 'node:crypto';
import {
  AlertRuleModel,
  type AlertRuleType,
  type AlertScope,
} from '../models/alert-rule.model.js';

export interface CreateAlertRuleInput {
  name: string;
  ruleType: AlertRuleType;
  scope?: AlertScope;
  scopeId?: string | null;
  thresholdValue: number;
  thresholdUnit?: string | null;
  notifyChannels: string[];
  enabled?: boolean;
  createdBy?: string;
}

export interface UpdateAlertRuleInput {
  name?: string;
  ruleType?: AlertRuleType;
  scope?: AlertScope;
  scopeId?: string | null;
  thresholdValue?: number;
  thresholdUnit?: string | null;
  notifyChannels?: string[];
  enabled?: boolean;
}

export class AlertRuleRepository {
  async listAll(): Promise<AlertRuleModel[]> {
    return AlertRuleModel.query().orderBy('updated_at', 'desc');
  }

  async listEnabled(): Promise<AlertRuleModel[]> {
    return AlertRuleModel.query().where('enabled', true).orderBy('updated_at', 'desc');
  }

  async findById(id: string): Promise<AlertRuleModel | undefined> {
    return AlertRuleModel.query().findById(id);
  }

  async create(input: CreateAlertRuleInput): Promise<AlertRuleModel> {
    const id = randomUUID();
    return AlertRuleModel.query().insertAndFetch({
      id,
      name: input.name.trim(),
      ruleType: input.ruleType,
      scope: input.scope ?? 'global',
      scopeId: input.scopeId ?? null,
      thresholdValue: input.thresholdValue,
      thresholdUnit: input.thresholdUnit ?? null,
      notifyChannels: input.notifyChannels,
      enabled: input.enabled ?? true,
      createdBy: input.createdBy ?? null,
    });
  }

  async update(id: string, input: UpdateAlertRuleInput): Promise<AlertRuleModel> {
    await AlertRuleModel.query().findById(id).patch({
      ...input,
      ...(input.name ? { name: input.name.trim() } : {}),
      updatedAt: new Date(),
    });
    return AlertRuleModel.query().findById(id).throwIfNotFound();
  }

  async delete(id: string): Promise<void> {
    await AlertRuleModel.query().deleteById(id);
  }
}
