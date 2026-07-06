import { Model, snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';
import { KnowledgeDocItemModel } from './knowledge-doc-item.model.js';

export class KnowledgeBaseModel extends BaseModel {
  static tableName = 'knowledge_bases';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  title!: string;
  repoIds!: string[];
  createdBy!: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  static get jsonAttributes() {
    return ['repoIds'];
  }

  items?: KnowledgeDocItemModel[];

  static get relationMappings() {
    return {
      items: {
        relation: Model.HasManyRelation,
        modelClass: KnowledgeDocItemModel,
        join: { from: 'knowledge_bases.id', to: 'knowledge_doc_items.knowledge_base_id' },
      },
    };
  }
}
