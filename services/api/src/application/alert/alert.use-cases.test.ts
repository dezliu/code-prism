import { describe, expect, it } from 'vitest';
import {
  CreateAlertRuleUseCase,
  UpdateAlertRuleUseCase,
} from './alert.use-cases';
import type { AlertRuleRepository } from '../../infrastructure/db/repositories/alert-rule.repository.js';

function createMockAlertRepo(): AlertRuleRepository {
  const store = new Map<string, any>();

  return {
    listAll: async () => [...store.values()],
    listEnabled: async () => [...store.values()].filter((r) => r.enabled),
    findById: async (id: string) => store.get(id),
    create: async (input) => {
      const id = 'alert-1';
      const row = {
        id,
        name: input.name,
        ruleType: input.ruleType,
        scope: input.scope ?? 'global',
        scopeId: input.scopeId ?? null,
        thresholdValue: input.thresholdValue,
        thresholdUnit: input.thresholdUnit ?? null,
        notifyChannels: input.notifyChannels,
        enabled: input.enabled ?? true,
        createdBy: input.createdBy ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(id, row);
      return row;
    },
    update: async (id, input) => {
      const row = store.get(id);
      Object.assign(row, input, { updatedAt: new Date() });
      return row;
    },
    delete: async (id) => {
      store.delete(id);
    },
  } as unknown as AlertRuleRepository;
}

describe('CreateAlertRuleUseCase', () => {
  it('rejects non-positive threshold', async () => {
    const useCase = new CreateAlertRuleUseCase(createMockAlertRepo());
    await expect(
      useCase.execute({
        name: '健康度',
        ruleType: 'health_score_min',
        thresholdValue: 0,
        notifyChannels: ['in_app'],
      }),
    ).rejects.toThrow('阈值须为正数');
  });

  it('creates global health score rule', async () => {
    const useCase = new CreateAlertRuleUseCase(createMockAlertRepo());
    const rule = await useCase.execute({
      name: '健康度下限',
      ruleType: 'health_score_min',
      thresholdValue: 60,
      notifyChannels: ['in_app', 'email'],
    });
    expect(rule.scope).toBe('global');
    expect(rule.thresholdUnit).toBe('score');
  });
});

describe('UpdateAlertRuleUseCase', () => {
  it('requires scopeId for project scope', async () => {
    const repo = createMockAlertRepo();
    const created = await new CreateAlertRuleUseCase(repo).execute({
      name: '循环依赖',
      ruleType: 'circular_deps_max',
      thresholdValue: 5,
      notifyChannels: ['in_app'],
    });
    await expect(
      new UpdateAlertRuleUseCase(repo).execute(created.id, { scope: 'project' }),
    ).rejects.toThrow('团队/项目级规则须指定作用范围 ID');
  });
});
