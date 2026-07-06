import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type DocType = 'design' | 'adr' | 'ops' | 'training' | 'other';
export type DocStatus = 'draft' | 'published';

export class KnowledgeDocModel extends BaseModel {
  static tableName = 'knowledge_docs';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  title!: string;
  docType!: DocType;
  status!: DocStatus;
  content!: string;
  repoIds!: string[];
  createdBy!: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  static get jsonAttributes() {
    return ['repoIds'];
  }
}
