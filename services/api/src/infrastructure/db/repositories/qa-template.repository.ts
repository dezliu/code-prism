import { randomUUID } from 'node:crypto';
import {
  QaTemplateModel,
  type QaOutputField,
  type QaTemplateStatus,
  type QuestionType,
} from '../models/qa-template.model.js';

export interface CreateQaTemplateInput {
  name: string;
  questionTypes: QuestionType[];
  keywords: string[];
  outputFields: QaOutputField[];
  previewTemplate: string;
  applicableRoles?: string[];
  status?: QaTemplateStatus;
  priority?: number;
  createdBy?: string;
}

export interface UpdateQaTemplateInput {
  name?: string;
  questionTypes?: QuestionType[];
  keywords?: string[];
  outputFields?: QaOutputField[];
  previewTemplate?: string;
  applicableRoles?: string[];
  status?: QaTemplateStatus;
  priority?: number;
}

export class QaTemplateRepository {
  async listAll(): Promise<QaTemplateModel[]> {
    return QaTemplateModel.query().orderBy('priority', 'desc').orderBy('updated_at', 'desc');
  }

  async listEnabled(): Promise<QaTemplateModel[]> {
    return QaTemplateModel.query()
      .where('status', 'enabled')
      .orderBy('priority', 'desc')
      .orderBy('updated_at', 'desc');
  }

  async findById(id: string): Promise<QaTemplateModel | undefined> {
    return QaTemplateModel.query().findById(id);
  }

  async findByName(name: string): Promise<QaTemplateModel | undefined> {
    return QaTemplateModel.query().findOne({ name });
  }

  async create(input: CreateQaTemplateInput): Promise<QaTemplateModel> {
    const id = randomUUID();
    return QaTemplateModel.query().insertAndFetch({
      id,
      name: input.name.trim(),
      questionTypes: input.questionTypes,
      keywords: input.keywords,
      outputFields: input.outputFields,
      previewTemplate: input.previewTemplate,
      applicableRoles: input.applicableRoles ?? null,
      status: input.status ?? 'enabled',
      priority: input.priority ?? 0,
      createdBy: input.createdBy ?? null,
    });
  }

  async update(id: string, input: UpdateQaTemplateInput): Promise<QaTemplateModel> {
    await QaTemplateModel.query().findById(id).patch({
      ...input,
      ...(input.name ? { name: input.name.trim() } : {}),
      updatedAt: new Date(),
    });
    return QaTemplateModel.query().findById(id).throwIfNotFound();
  }

  async delete(id: string): Promise<void> {
    await QaTemplateModel.query().deleteById(id);
  }
}
