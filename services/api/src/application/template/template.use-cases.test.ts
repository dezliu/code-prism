import { describe, expect, it } from 'vitest';
import {
  CreateQaTemplateUseCase,
  UpdateQaTemplateUseCase,
  DeleteQaTemplateUseCase,
} from './template.use-cases';
import type { QaTemplateRepository } from '../../infrastructure/db/repositories/qa-template.repository.js';

function createMockTemplateRepo(): QaTemplateRepository {
  const store = new Map<string, any>();

  return {
    listAll: async () => [...store.values()],
    listEnabled: async () => [...store.values()].filter((t) => t.status === 'enabled'),
    findById: async (id: string) => store.get(id),
    findByName: async (name: string) => [...store.values()].find((t) => t.name === name),
    create: async (input) => {
      const id = 'tpl-1';
      const row = {
        id,
        name: input.name,
        questionTypes: input.questionTypes,
        keywords: input.keywords,
        outputFields: input.outputFields,
        previewTemplate: input.previewTemplate,
        applicableRoles: input.applicableRoles ?? null,
        status: input.status ?? 'enabled',
        priority: input.priority ?? 0,
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
  } as unknown as QaTemplateRepository;
}

describe('CreateQaTemplateUseCase', () => {
  it('rejects duplicate template names', async () => {
    const repo = createMockTemplateRepo();
    const useCase = new CreateQaTemplateUseCase(repo);
    await useCase.execute({
      name: '架构概览',
      questionTypes: ['architecture'],
      keywords: ['架构'],
      outputFields: [{ name: '概述', required: true }],
      previewTemplate: '按架构模板输出',
    });
    await expect(
      useCase.execute({
        name: '架构概览',
        questionTypes: ['architecture'],
        keywords: ['模块'],
        outputFields: [{ name: '模块', required: true }],
        previewTemplate: '预览',
      }),
    ).rejects.toThrow('模板名称已存在');
  });
});

describe('UpdateQaTemplateUseCase', () => {
  it('updates template status', async () => {
    const repo = createMockTemplateRepo();
    const created = await new CreateQaTemplateUseCase(repo).execute({
      name: '代码定位',
      questionTypes: ['code'],
      keywords: ['代码'],
      outputFields: [{ name: '入口', required: true }],
      previewTemplate: '定位代码',
    });
    const updated = await new UpdateQaTemplateUseCase(repo).execute(created.id, {
      status: 'disabled',
    });
    expect(updated.status).toBe('disabled');
  });
});

describe('DeleteQaTemplateUseCase', () => {
  it('deletes existing template', async () => {
    const repo = createMockTemplateRepo();
    const created = await new CreateQaTemplateUseCase(repo).execute({
      name: '删除测试',
      questionTypes: ['doc'],
      keywords: ['文档'],
      outputFields: [{ name: '标题', required: true }],
      previewTemplate: '文档模板',
    });
    const ok = await new DeleteQaTemplateUseCase(repo).execute(created.id);
    expect(ok).toBe(true);
    expect(await repo.findById(created.id)).toBeUndefined();
  });
});
