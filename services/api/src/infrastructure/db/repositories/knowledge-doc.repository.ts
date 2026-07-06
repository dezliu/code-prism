import { randomUUID } from 'node:crypto';
import { KnowledgeDocModel, type DocStatus, type DocType } from '../models/knowledge-doc.model.js';

export interface CreateKnowledgeDocInput {
  title: string;
  docType: DocType;
  content?: string;
  repoIds?: string[];
  createdBy?: string;
}

export class KnowledgeDocRepository {
  async listAll(): Promise<KnowledgeDocModel[]> {
    return KnowledgeDocModel.query().orderBy('updated_at', 'desc');
  }

  async findById(id: string): Promise<KnowledgeDocModel | undefined> {
    return KnowledgeDocModel.query().findById(id);
  }

  async create(input: CreateKnowledgeDocInput): Promise<KnowledgeDocModel> {
    const id = randomUUID();
    return KnowledgeDocModel.query().insertAndFetch({
      id,
      title: input.title.trim(),
      docType: input.docType,
      status: 'draft',
      content: input.content ?? '',
      repoIds: input.repoIds ?? [],
      createdBy: input.createdBy ?? null,
    });
  }

  async update(
    id: string,
    patch: Partial<Pick<KnowledgeDocModel, 'title' | 'content' | 'docType' | 'repoIds'>>,
  ): Promise<KnowledgeDocModel> {
    await KnowledgeDocModel.query().findById(id).patch({
      ...patch,
      updatedAt: new Date(),
    });
    return KnowledgeDocModel.query().findById(id).throwIfNotFound();
  }

  async publish(id: string): Promise<KnowledgeDocModel> {
    await KnowledgeDocModel.query().findById(id).patch({
      status: 'published' as DocStatus,
      updatedAt: new Date(),
    });
    return KnowledgeDocModel.query().findById(id).throwIfNotFound();
  }

  async listPublishedByRepo(repoId: string): Promise<KnowledgeDocModel[]> {
    return KnowledgeDocModel.query()
      .where('status', 'published')
      .whereRaw('JSON_CONTAINS(repo_ids, ?)', [JSON.stringify(repoId)])
      .orderBy('updated_at', 'desc');
  }
}
