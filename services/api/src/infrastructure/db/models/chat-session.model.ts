import { Model, snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';
import { ChatMessageModel } from './chat-message.model.js';

export interface ContextAnchor {
  entityType: 'service' | 'module' | 'table' | 'doc' | 'repo';
  entityId: string;
  entityName: string;
  repoId?: string;
}

export class ChatSessionModel extends BaseModel {
  static tableName = 'chat_sessions';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  userId!: string;
  title!: string;
  anchor!: ContextAnchor | null;
  createdAt!: Date;
  updatedAt!: Date;

  static get relationMappings() {
    return {
      messages: {
        relation: Model.HasManyRelation,
        modelClass: ChatMessageModel,
        join: { from: 'chat_sessions.id', to: 'chat_messages.session_id' },
      },
    };
  }
}
