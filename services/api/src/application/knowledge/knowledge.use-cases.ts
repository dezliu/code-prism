import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import {
  KnowledgeDocRepository,
  type CreateKnowledgeDocInput,
  type UpdateKnowledgeDocInput,
} from '../../infrastructure/db/repositories/knowledge-doc.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerDocClient } from '../../infrastructure/clients/ai-worker-doc.client.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { KnowledgeDocModel } from '../../infrastructure/db/models/knowledge-doc.model.js';

export interface KnowledgeDocSummary {
  id: string;
  title: string;
  status: string;
  docType: string;
  repoIds: string[];
  content?: string;
}

function toSummary(doc: KnowledgeDocModel, includeContent = false): KnowledgeDocSummary {
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    docType: doc.docType,
    repoIds: doc.repoIds,
    ...(includeContent ? { content: doc.content } : {}),
  };
}

async function buildCodeContext(core: CoreHttpClient, repoIds: string[]): Promise<string> {
  const hits = await core.search('项目结构 核心功能 接口 模块 代码', repoIds);
  if (!hits.length) {
    return '';
  }
  return hits.map((h) => `### ${h.title} (${h.type})\n${h.snippet}${h.ref ? `\n引用: ${h.ref}` : ''}`).join('\n\n');
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

export class ListKnowledgeDocsUseCase {
  constructor(private readonly docs: KnowledgeDocRepository) {}

  async execute(): Promise<KnowledgeDocSummary[]> {
    const rows = await this.docs.listAll();
    return rows.map((d) => toSummary(d));
  }
}

export class GetKnowledgeDocUseCase {
  constructor(private readonly docs: KnowledgeDocRepository) {}

  async execute(id: string): Promise<KnowledgeDocSummary> {
    const doc = await this.docs.findById(id);
    if (!doc) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    return toSummary(doc, true);
  }
}

export class CreateKnowledgeDocUseCase {
  constructor(private readonly docs: KnowledgeDocRepository) {}

  async execute(input: CreateKnowledgeDocInput): Promise<KnowledgeDocSummary> {
    if (!input.title?.trim()) {
      throw new ApplicationError('文档标题不能为空', 'VALIDATION_ERROR');
    }
    const doc = await this.docs.create(input);
    return toSummary(doc);
  }
}

export class UpdateKnowledgeDocUseCase {
  constructor(private readonly docs: KnowledgeDocRepository) {}

  async execute(id: string, input: UpdateKnowledgeDocInput): Promise<KnowledgeDocSummary> {
    const doc = await this.docs.findById(id);
    if (!doc) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    if (input.title !== undefined && !input.title.trim()) {
      throw new ApplicationError('文档标题不能为空', 'VALIDATION_ERROR');
    }
    const updated = await this.docs.update(id, {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.docType !== undefined ? { docType: input.docType } : {}),
      ...(input.repoIds !== undefined ? { repoIds: input.repoIds } : {}),
    });
    return toSummary(updated, true);
  }
}

export class PublishKnowledgeDocUseCase {
  constructor(private readonly docs: KnowledgeDocRepository) {}

  async execute(id: string): Promise<KnowledgeDocSummary> {
    const doc = await this.docs.findById(id);
    if (!doc) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    const published = await this.docs.publish(id);
    return toSummary(published);
  }
}

export class GenerateKnowledgeDocContentUseCase {
  constructor(
    private readonly docs: KnowledgeDocRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerDocClient,
  ) {}

  async execute(id: string): Promise<KnowledgeDocSummary> {
    const doc = await this.docs.findById(id);
    if (!doc) {
      throw new NotFoundError('KnowledgeDoc', id);
    }
    if (!doc.repoIds?.length) {
      throw new ApplicationError('请先关联至少一个 Git 仓库', 'VALIDATION_ERROR');
    }

    const repoNames = await resolveRepoNames(this.repos, doc.repoIds);
    const context = await buildCodeContext(this.core, doc.repoIds);
    const { content } = await this.aiWorker.generateDoc({
      title: doc.title,
      docType: doc.docType,
      repoNames,
      context,
    });

    const updated = await this.docs.update(id, { content });
    return toSummary(updated, true);
  }
}

/** @deprecated 请使用 createKnowledgeDoc + generateKnowledgeDocContent */
export class GenerateTrainingDocUseCase {
  constructor(
    private readonly docs: KnowledgeDocRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerDocClient,
  ) {}

  async execute(repoId: string, createdBy?: string): Promise<KnowledgeDocSummary> {
    const doc = await this.docs.create({
      title: '培训文档草稿',
      docType: 'training',
      content: '',
      repoIds: [repoId],
      createdBy,
    });
    return new GenerateKnowledgeDocContentUseCase(
      this.docs,
      this.repos,
      this.core,
      this.aiWorker,
    ).execute(doc.id);
  }
}
