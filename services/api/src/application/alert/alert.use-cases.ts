import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import {
  AlertRuleRepository,
  type CreateAlertRuleInput,
  type UpdateAlertRuleInput,
} from '../../infrastructure/db/repositories/alert-rule.repository.js';
import type { AlertRuleModel, AlertRuleType } from '../../infrastructure/db/models/alert-rule.model.js';

export interface AlertRuleSummary {
  id: string;
  name: string;
  ruleType: string;
  scope: string;
  scopeId: string | null;
  thresholdValue: number;
  thresholdUnit: string | null;
  notifyChannels: string[];
  enabled: boolean;
  updatedAt: string;
}

const RULE_UNITS: Record<AlertRuleType, string> = {
  health_score_min: 'score',
  circular_deps_max: 'count',
  file_lines_max: 'lines',
  arch_drift: 'count',
};

function toSummary(rule: AlertRuleModel): AlertRuleSummary {
  return {
    id: rule.id,
    name: rule.name,
    ruleType: rule.ruleType,
    scope: rule.scope,
    scopeId: rule.scopeId,
    thresholdValue: Number(rule.thresholdValue),
    thresholdUnit: rule.thresholdUnit,
    notifyChannels: rule.notifyChannels,
    enabled: rule.enabled,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function validateAlertInput(input: {
  name?: string;
  thresholdValue?: number;
  scope?: string;
  scopeId?: string | null;
  ruleType?: AlertRuleType;
  thresholdUnit?: string | null;
}) {
  if (input.name !== undefined && !input.name.trim()) {
    throw new ApplicationError('规则名称不能为空', 'VALIDATION_ERROR');
  }
  if (input.thresholdValue !== undefined) {
    if (!Number.isFinite(input.thresholdValue) || input.thresholdValue <= 0) {
      throw new ApplicationError('阈值须为正数', 'VALIDATION_ERROR');
    }
    if (input.ruleType === 'health_score_min' && input.thresholdValue > 100) {
      throw new ApplicationError('健康度评分阈值须在 1~100 之间', 'VALIDATION_ERROR');
    }
  }
  if (input.scope && input.scope !== 'global' && !input.scopeId) {
    throw new ApplicationError('团队/项目级规则须指定作用范围 ID', 'VALIDATION_ERROR');
  }
}

export class ListAlertRulesUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(): Promise<AlertRuleSummary[]> {
    const rows = await this.rules.listAll();
    return rows.map(toSummary);
  }
}

export class CreateAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(input: CreateAlertRuleInput): Promise<AlertRuleSummary> {
    validateAlertInput(input);
    const created = await this.rules.create({
      ...input,
      thresholdUnit: input.thresholdUnit ?? RULE_UNITS[input.ruleType],
    });
    return toSummary(created);
  }
}

export class UpdateAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(id: string, input: UpdateAlertRuleInput): Promise<AlertRuleSummary> {
    const current = await this.rules.findById(id);
    if (!current) {
      throw new NotFoundError('AlertRule', id);
    }
    validateAlertInput({
      ...input,
      ruleType: input.ruleType ?? current.ruleType,
    });
    const updated = await this.rules.update(id, {
      ...input,
      thresholdUnit:
        input.thresholdUnit ??
        (input.ruleType ? RULE_UNITS[input.ruleType] : undefined),
    });
    return toSummary(updated);
  }
}

export class DeleteAlertRuleUseCase {
  constructor(private readonly rules: AlertRuleRepository) {}

  async execute(id: string): Promise<boolean> {
    const current = await this.rules.findById(id);
    if (!current) {
      throw new NotFoundError('AlertRule', id);
    }
    await this.rules.delete(id);
    return true;
  }
}
