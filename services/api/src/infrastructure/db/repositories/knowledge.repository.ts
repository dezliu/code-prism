import { randomUUID } from 'node:crypto';
import { KnowledgeBaseModel } from '../models/knowledge-base.model.js';
import {
  KnowledgeDocItemModel,
  type DocStatus,
  type DocType,
} from '../models/knowledge-doc-item.model.js';

export interface CreateKnowledgeBaseInput {
  title: string;
  repoIds?: string[];
  createdBy?: string;
}

export interface UpdateKnowledgeBaseInput {
  title?: string;
  repoIds?: string[];
}

export interface CreateKnowledgeDocItemInput {
  knowledgeBaseId: string;
  title: string;
  docType: DocType;
  content?: string;
}

export interface UpdateKnowledgeDocItemInput {
  title?: string;
  docType?: DocType;
  content?: string;
}

export class KnowledgeRepository {
  async listBases(): Promise<KnowledgeBaseModel[]> {
    return KnowledgeBaseModel.query()
      .withGraphFetched('items')
      .orderBy('updated_at', 'desc');
  }

  async findBaseById(id: string): Promise<KnowledgeBaseModel | undefined> {
    return KnowledgeBaseModel.query().findById(id).withGraphFetched('items');
  }

  async createBase(input: CreateKnowledgeBaseInput): Promise<KnowledgeBaseModel> {
    const id = randomUUID();
    await KnowledgeBaseModel.query().insert({
      id,
      title: input.title.trim(),
      repoIds: input.repoIds ?? [],
      createdBy: input.createdBy ?? null,
    });
    return (await this.findBaseById(id))!;
  }

  async updateBase(id: string, input: UpdateKnowledgeBaseInput): Promise<KnowledgeBaseModel> {
    await KnowledgeBaseModel.query().findById(id).patch({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.repoIds !== undefined ? { repoIds: input.repoIds } : {}),
      updatedAt: new Date(),
    });
    return KnowledgeBaseModel.query().findById(id).throwIfNotFound().withGraphFetched('items');
  }

  async deleteBase(id: string): Promise<void> {
    await KnowledgeBaseModel.query().deleteById(id);
  }

  async findItemById(id: string): Promise<KnowledgeDocItemModel | undefined> {
    return KnowledgeDocItemModel.query().findById(id);
  }

  async findItemWithBase(id: string): Promise<{
    item: KnowledgeDocItemModel;
    base: KnowledgeBaseModel;
  } | undefined> {
    const item = await this.findItemById(id);
    if (!item) {
      return undefined;
    }
    const base = await this.findBaseById(item.knowledgeBaseId);
    if (!base) {
      return undefined;
    }
    return { item, base };
  }

  async createItem(input: CreateKnowledgeDocItemInput): Promise<KnowledgeDocItemModel> {
    const id = randomUUID();
    await KnowledgeDocItemModel.query().insert({
      id,
      knowledgeBaseId: input.knowledgeBaseId,
      title: input.title.trim(),
      docType: input.docType,
      status: 'draft' as DocStatus,
      content: input.content ?? '',
      indexedInSearch: false,
    });
    await KnowledgeBaseModel.query().findById(input.knowledgeBaseId).patch({ updatedAt: new Date() });
    return KnowledgeDocItemModel.query().findById(id).throwIfNotFound();
  }

  async updateItem(
    id: string,
    patch: Partial<Pick<KnowledgeDocItemModel, 'title' | 'content' | 'docType'>>,
  ): Promise<KnowledgeDocItemModel> {
    const item = await this.findItemById(id);
    if (!item) {
      throw new Error(`KnowledgeDocItem not found: ${id}`);
    }
    await KnowledgeDocItemModel.query().findById(id).patch({
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      updatedAt: new Date(),
    });
    await KnowledgeBaseModel.query().findById(item.knowledgeBaseId).patch({ updatedAt: new Date() });
    return KnowledgeDocItemModel.query().findById(id).throwIfNotFound();
  }

  async publishItem(id: string): Promise<KnowledgeDocItemModel> {
    const item = await this.findItemById(id);
    if (!item) {
      throw new Error(`KnowledgeDocItem not found: ${id}`);
    }
    await KnowledgeDocItemModel.query().findById(id).patch({
      status: 'published' as DocStatus,
      updatedAt: new Date(),
    });
    await KnowledgeBaseModel.query().findById(item.knowledgeBaseId).patch({ updatedAt: new Date() });
    return KnowledgeDocItemModel.query().findById(id).throwIfNotFound();
  }

  async setItemIndexedInSearch(id: string, indexedInSearch: boolean): Promise<KnowledgeDocItemModel> {
    await KnowledgeDocItemModel.query().findById(id).patch({
      indexedInSearch,
      updatedAt: new Date(),
    });
    return KnowledgeDocItemModel.query().findById(id).throwIfNotFound();
  }

  async listPublishedItemsByRepo(repoId: string): Promise<KnowledgeDocItemModel[]> {
    const bases = await KnowledgeBaseModel.query();
    const baseIds = bases
      .filter((b) => Array.isArray(b.repoIds) && b.repoIds.includes(repoId))
      .map((b) => b.id);
    if (!baseIds.length) {
      return [];
    }
    return KnowledgeDocItemModel.query()
      .whereIn('knowledge_base_id', baseIds)
      .where('status', 'published')
      .orderBy('updated_at', 'desc');
  }
}
