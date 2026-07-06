import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import {
  QaTemplateRepository,
  type CreateQaTemplateInput,
  type UpdateQaTemplateInput,
} from '../../infrastructure/db/repositories/qa-template.repository.js';
import type { QaTemplateModel } from '../../infrastructure/db/models/qa-template.model.js';

export interface QaTemplateSummary {
  id: string;
  name: string;
  questionTypes: string[];
  keywords: string[];
  outputFields: Array<{ name: string; required: boolean }>;
  previewTemplate: string;
  applicableRoles: string[] | null;
  status: string;
  priority: number;
  updatedAt: string;
}

export interface QaTemplateHint {
  templateId: string;
  name: string;
  preview: string;
  keywords: string[];
  priority: number;
}

function toSummary(template: QaTemplateModel): QaTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    questionTypes: template.questionTypes,
    keywords: template.keywords,
    outputFields: template.outputFields,
    previewTemplate: template.previewTemplate,
    applicableRoles: template.applicableRoles,
    status: template.status,
    priority: template.priority,
    updatedAt: template.updatedAt.toISOString(),
  };
}

function toHint(template: QaTemplateModel): QaTemplateHint {
  return {
    templateId: template.id,
    name: template.name,
    preview: template.previewTemplate,
    keywords: template.keywords,
    priority: template.priority,
  };
}

function validateTemplateInput(input: {
  name?: string;
  questionTypes?: string[];
  keywords?: string[];
  outputFields?: Array<{ name: string; required: boolean }>;
  previewTemplate?: string;
}) {
  if (input.name !== undefined && !input.name.trim()) {
    throw new ApplicationError('模板名称不能为空', 'VALIDATION_ERROR');
  }
  if (input.questionTypes !== undefined && input.questionTypes.length === 0) {
    throw new ApplicationError('至少选择一种问题类型', 'VALIDATION_ERROR');
  }
  if (input.keywords !== undefined && input.keywords.length === 0) {
    throw new ApplicationError('至少配置一个关键词', 'VALIDATION_ERROR');
  }
  if (input.outputFields !== undefined && input.outputFields.length === 0) {
    throw new ApplicationError('至少定义一个输出字段', 'VALIDATION_ERROR');
  }
  if (input.previewTemplate !== undefined && !input.previewTemplate.trim()) {
    throw new ApplicationError('预览模板不能为空', 'VALIDATION_ERROR');
  }
}

export class ListQaTemplatesUseCase {
  constructor(private readonly templates: QaTemplateRepository) {}

  async execute(): Promise<QaTemplateSummary[]> {
    const rows = await this.templates.listAll();
    return rows.map(toSummary);
  }
}

export class ListEnabledQaTemplatesUseCase {
  constructor(private readonly templates: QaTemplateRepository) {}

  async execute(): Promise<QaTemplateHint[]> {
    const rows = await this.templates.listEnabled();
    return rows.map(toHint);
  }
}

export class CreateQaTemplateUseCase {
  constructor(private readonly templates: QaTemplateRepository) {}

  async execute(input: CreateQaTemplateInput): Promise<QaTemplateSummary> {
    validateTemplateInput(input);
    const existing = await this.templates.findByName(input.name.trim());
    if (existing) {
      throw new ApplicationError('模板名称已存在', 'VALIDATION_ERROR');
    }
    const created = await this.templates.create(input);
    return toSummary(created);
  }
}

export class UpdateQaTemplateUseCase {
  constructor(private readonly templates: QaTemplateRepository) {}

  async execute(id: string, input: UpdateQaTemplateInput): Promise<QaTemplateSummary> {
    const current = await this.templates.findById(id);
    if (!current) {
      throw new NotFoundError('QaTemplate', id);
    }
    validateTemplateInput(input);
    if (input.name && input.name.trim() !== current.name) {
      const existing = await this.templates.findByName(input.name.trim());
      if (existing) {
        throw new ApplicationError('模板名称已存在', 'VALIDATION_ERROR');
      }
    }
    const updated = await this.templates.update(id, input);
    return toSummary(updated);
  }
}

export class DeleteQaTemplateUseCase {
  constructor(private readonly templates: QaTemplateRepository) {}

  async execute(id: string): Promise<boolean> {
    const current = await this.templates.findById(id);
    if (!current) {
      throw new NotFoundError('QaTemplate', id);
    }
    await this.templates.delete(id);
    return true;
  }
}

export class PreviewQaTemplateUseCase {
  async execute(
    template: Pick<QaTemplateSummary, 'outputFields' | 'previewTemplate'>,
    sampleQuestion: string,
  ): Promise<string> {
    const question = sampleQuestion.trim() || '（示例问题）';
    const fields = template.outputFields
      .map((f) => `- ${f.name}${f.required ? '（必填）' : '（可选）'}：…`)
      .join('\n');
    return [
      `问题：${question}`,
      '',
      template.previewTemplate,
      '',
      '结构化输出预览：',
      fields,
    ].join('\n');
  }
}
