import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import {
  KnowledgeDocRepository,
  type CreateKnowledgeDocInput,
} from '../../infrastructure/db/repositories/knowledge-doc.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
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

export class ListKnowledgeDocsUseCase {
  constructor(private readonly docs: KnowledgeDocRepository) {}

  async execute(): Promise<KnowledgeDocSummary[]> {
    const rows = await this.docs.listAll();
    return rows.map((d) => toSummary(d));
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

export class GenerateTrainingDocUseCase {
  constructor(
    private readonly docs: KnowledgeDocRepository,
    private readonly core: CoreHttpClient,
  ) {}

  async execute(repoId: string, createdBy?: string): Promise<KnowledgeDocSummary> {
    const hits = await this.core.search('项目结构 核心功能 接口', [repoId]);
    const sections = hits.map((h) => `## ${h.title}\n${h.snippet}`).join('\n\n');
    const content = [
      '# 培训文档草稿',
      '',
      '## 项目结构概览',
      '基于索引数据自动生成的结构摘要。',
      '',
      '## 核心功能说明',
      sections || '（暂无检索结果，请完成索引后重试）',
      '',
      '## 接口清单摘要',
      '待索引完成后补充。',
      '',
      '## 数据实体关系',
      '待索引完成后补充。',
    ].join('\n');

    const doc = await this.docs.create({
      title: '培训文档草稿',
      docType: 'training',
      content,
      repoIds: [repoId],
      createdBy,
    });
    return toSummary(doc, true);
  }
}
