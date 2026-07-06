import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerDocClient } from '../../infrastructure/clients/ai-worker-doc.client.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { KnowledgeBaseModel } from '../../infrastructure/db/models/knowledge-base.model.js';
import type { KnowledgeDocItemModel } from '../../infrastructure/db/models/knowledge-doc-item.model.js';
import type { DocType } from '../../infrastructure/db/models/knowledge-doc-item.model.js';

export interface KnowledgeBaseSummary {
  id: string;
  title: string;
  repoIds: string[];
  itemCount: number;
  items?: KnowledgeDocItemSummary[];
}

export interface KnowledgeDocItemSummary {
  id: string;
  knowledgeBaseId: string;
  title: string;
  status: string;
  docType: string;
  indexedInSearch: boolean;
  content?: string;
  repoIds?: string[];
}

/** @deprecated 兼容旧 API */
export interface KnowledgeDocSummary {
  id: string;
  title: string;
  status: string;
  docType: string;
  repoIds: string[];
  content?: string;
}

function toItemSummary(
  item: KnowledgeDocItemModel,
  base?: KnowledgeBaseModel,
  includeContent = false,
): KnowledgeDocItemSummary {
  return {
    id: item.id,
    knowledgeBaseId: item.knowledgeBaseId,
    title: item.title,
    status: item.status,
    docType: item.docType,
    indexedInSearch: item.indexedInSearch,
    ...(base ? { repoIds: base.repoIds } : {}),
    ...(includeContent ? { content: item.content } : {}),
  };
}

function toBaseSummary(base: KnowledgeBaseModel, includeItems = false): KnowledgeBaseSummary {
  return {
    id: base.id,
    title: base.title,
    repoIds: base.repoIds,
    itemCount: base.items?.length ?? 0,
    ...(includeItems
      ? { items: (base.items ?? []).map((item) => toItemSummary(item, base)) }
      : {}),
  };
}

/** @deprecated */
function toLegacyDocSummary(
  item: KnowledgeDocItemModel,
  base: KnowledgeBaseModel,
  includeContent = false,
): KnowledgeDocSummary {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    docType: item.docType,
    repoIds: base.repoIds,
    ...(includeContent ? { content: item.content } : {}),
  };
}

export async function buildKnowledgeDocContext(core: CoreHttpClient, repoIds: string[]): Promise<string> {
  const docContext = await core.buildDocContext(repoIds);

  let searchHits: Awaited<ReturnType<CoreHttpClient['search']>> = [];
  try {
    searchHits = await core.search('系统架构 业务模块 数据表 API 接口 对外服务', repoIds);
  } catch {
    // 语义检索为补充信息，失败不阻断文档生成
  }

  const sections = [docContext.contextText];
  if (searchHits.length) {
    const searchSection = searchHits
      .map((h) => `### ${h.title} (${h.type})\n${h.snippet}${h.ref ? `\n引用: ${h.ref}` : ''}`)
      .join('\n\n');
    sections.push(`## 语义检索补充\n\n${searchSection}`);
  }
  return sections.join('\n\n---\n\n');
}

async function resolveRepoNames(repos: RepoRepository, repoIds: string[]): Promise<string[]> {
  const names: string[] = [];
  for (const repoId of repoIds) {
    const repo = await repos.findById(repoId);
    if (repo) {
      const meta = repo.metadata as { displayName?: string } | undefined;
      names.push(meta?.displayName ?? repo.name);
    }
  }
  return names;
}

export class ListKnowledgeBasesUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(): Promise<KnowledgeBaseSummary[]> {
    const rows = await this.knowledge.listBases();
    return rows.map((b) => toBaseSummary(b, true));
  }
}

export class GetKnowledgeBaseUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string): Promise<KnowledgeBaseSummary> {
    const base = await this.knowledge.findBaseById(id);
    if (!base) {
      throw new NotFoundError('KnowledgeBase', id);
    }
    return toBaseSummary(base, true);
  }
}

export class CreateKnowledgeBaseUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(input: { title: string; repoIds?: string[]; createdBy?: string }): Promise<KnowledgeBaseSummary> {
    if (!input.title?.trim()) {
      throw new ApplicationError('知识库标题不能为空', 'VALIDATION_ERROR');
    }
    const base = await this.knowledge.createBase(input);
    return toBaseSummary(base, true);
  }
}

export class UpdateKnowledgeBaseUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string, input: { title?: string; repoIds?: string[] }): Promise<KnowledgeBaseSummary> {
    const base = await this.knowledge.findBaseById(id);
    if (!base) {
      throw new NotFoundError('KnowledgeBase', id);
    }
    if (input.title !== undefined && !input.title.trim()) {
      throw new ApplicationError('知识库标题不能为空', 'VALIDATION_ERROR');
    }
    const updated = await this.knowledge.updateBase(id, input);
    return toBaseSummary(updated, true);
  }
}

export class DeleteKnowledgeBaseUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string): Promise<boolean> {
    const base = await this.knowledge.findBaseById(id);
    if (!base) {
      throw new NotFoundError('KnowledgeBase', id);
    }
    await this.knowledge.deleteBase(id);
    return true;
  }
}

export class GetKnowledgeDocItemUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string): Promise<KnowledgeDocItemSummary> {
    const pair = await this.knowledge.findItemWithBase(id);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', id);
    }
    return toItemSummary(pair.item, pair.base, true);
  }
}

export class CreateKnowledgeDocItemUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(input: {
    knowledgeBaseId: string;
    title: string;
    docType: DocType;
    content?: string;
  }): Promise<KnowledgeDocItemSummary> {
    if (!input.title?.trim()) {
      throw new ApplicationError('文档标题不能为空', 'VALIDATION_ERROR');
    }
    const base = await this.knowledge.findBaseById(input.knowledgeBaseId);
    if (!base) {
      throw new NotFoundError('KnowledgeBase', input.knowledgeBaseId);
    }
    const item = await this.knowledge.createItem(input);
    return toItemSummary(item, base, true);
  }
}

export class UpdateKnowledgeDocItemUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(
    id: string,
    input: { title?: string; docType?: DocType; content?: string },
  ): Promise<KnowledgeDocItemSummary> {
    const pair = await this.knowledge.findItemWithBase(id);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', id);
    }
    if (input.title !== undefined && !input.title.trim()) {
      throw new ApplicationError('文档标题不能为空', 'VALIDATION_ERROR');
    }
    const updated = await this.knowledge.updateItem(id, input);
    return toItemSummary(updated, pair.base, true);
  }
}

export class PublishKnowledgeDocItemUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string): Promise<KnowledgeDocItemSummary> {
    const pair = await this.knowledge.findItemWithBase(id);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', id);
    }
    const published = await this.knowledge.publishItem(id);
    return toItemSummary(published, pair.base, true);
  }
}

export class UpdateKnowledgeDocItemIndexUseCase {
  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly core: CoreHttpClient,
  ) {}

  async execute(itemId: string, indexedInSearch: boolean): Promise<KnowledgeDocItemSummary> {
    const pair = await this.knowledge.findItemWithBase(itemId);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', itemId);
    }
    if (indexedInSearch && pair.item.status !== 'published') {
      throw new ApplicationError('仅已发布文档可纳入检索库', 'VALIDATION_ERROR');
    }
    await this.knowledge.setItemIndexedInSearch(itemId, indexedInSearch);
    if (indexedInSearch) {
      await this.core.indexKnowledgeDoc(itemId);
    } else {
      await this.core.removeKnowledgeDoc(itemId);
    }
    const updated = await this.knowledge.findItemById(itemId);
    return toItemSummary(updated!, pair.base, true);
  }
}

export class GenerateKnowledgeDocContentUseCase {
  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerDocClient,
  ) {}

  async execute(itemId: string): Promise<KnowledgeDocItemSummary> {
    const pair = await this.knowledge.findItemWithBase(itemId);
    if (!pair) {
      throw new NotFoundError('KnowledgeDocItem', itemId);
    }
    if (!pair.base.repoIds?.length) {
      throw new ApplicationError('请先为知识库关联至少一个 Git 仓库', 'VALIDATION_ERROR');
    }

    const repoNames = await resolveRepoNames(this.repos, pair.base.repoIds);
    const context = await buildKnowledgeDocContext(this.core, pair.base.repoIds);
    const { content } = await this.aiWorker.generateDoc({
      title: pair.item.title,
      docType: pair.item.docType,
      repoNames,
      context,
    });

    const updated = await this.knowledge.updateItem(itemId, { content });
    return toItemSummary(updated, pair.base, true);
  }
}

/** @deprecated */
export class ListKnowledgeDocsUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(): Promise<KnowledgeDocSummary[]> {
    const bases = await this.knowledge.listBases();
    const docs: KnowledgeDocSummary[] = [];
    for (const base of bases) {
      for (const item of base.items ?? []) {
        docs.push(toLegacyDocSummary(item, base));
      }
    }
    return docs;
  }
}

/** @deprecated */
export class GetKnowledgeDocUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string): Promise<KnowledgeDocSummary> {
    const pair = await this.knowledge.findItemWithBase(id);
    if (!pair) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    return toLegacyDocSummary(pair.item, pair.base, true);
  }
}

/** @deprecated */
export class CreateKnowledgeDocUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(input: {
    title: string;
    docType: DocType;
    content?: string;
    repoIds?: string[];
    createdBy?: string;
  }): Promise<KnowledgeDocSummary> {
    const base = await this.knowledge.createBase({
      title: input.title,
      repoIds: input.repoIds ?? [],
      createdBy: input.createdBy,
    });
    const item = await this.knowledge.createItem({
      knowledgeBaseId: base.id,
      title: input.title,
      docType: input.docType,
      content: input.content,
    });
    return toLegacyDocSummary(item, base, true);
  }
}

/** @deprecated */
export class UpdateKnowledgeDocUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(
    id: string,
    input: { title?: string; docType?: DocType; content?: string; repoIds?: string[] },
  ): Promise<KnowledgeDocSummary> {
    const pair = await this.knowledge.findItemWithBase(id);
    if (!pair) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    if (input.repoIds !== undefined) {
      await this.knowledge.updateBase(pair.base.id, { repoIds: input.repoIds });
    }
    const updated = await this.knowledge.updateItem(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.docType !== undefined ? { docType: input.docType } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    });
    const base = await this.knowledge.findBaseById(pair.base.id);
    return toLegacyDocSummary(updated, base!, true);
  }
}

/** @deprecated */
export class PublishKnowledgeDocUseCase {
  constructor(private readonly knowledge: KnowledgeRepository) {}

  async execute(id: string): Promise<KnowledgeDocSummary> {
    const pair = await this.knowledge.findItemWithBase(id);
    if (!pair) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    const published = await this.knowledge.publishItem(id);
    return toLegacyDocSummary(published, pair.base, true);
  }
}

/** @deprecated */
export class GenerateTrainingDocUseCase {
  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerDocClient,
  ) {}

  async execute(repoId: string, createdBy?: string): Promise<KnowledgeDocSummary> {
    const base = await this.knowledge.createBase({
      title: '培训文档草稿',
      repoIds: [repoId],
      createdBy,
    });
    const item = await this.knowledge.createItem({
      knowledgeBaseId: base.id,
      title: '培训文档草稿',
      docType: 'training',
      content: '',
    });
    const generated = await new GenerateKnowledgeDocContentUseCase(
      this.knowledge,
      this.repos,
      this.core,
      this.aiWorker,
    ).execute(item.id);
    return {
      id: generated.id,
      title: generated.title,
      status: generated.status,
      docType: generated.docType,
      repoIds: generated.repoIds ?? [repoId],
      content: generated.content,
    };
  }
}
