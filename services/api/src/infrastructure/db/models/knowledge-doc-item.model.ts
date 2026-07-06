import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type DocType = 'design' | 'adr' | 'ops' | 'training' | 'other';
export type DocStatus = 'draft' | 'published';

export class KnowledgeDocItemModel extends BaseModel {
  static tableName = 'knowledge_doc_items';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  knowledgeBaseId!: string;
  title!: string;
  docType!: DocType;
  status!: DocStatus;
  content!: string;
  indexedInSearch!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
