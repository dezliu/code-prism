import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type MessageRole = 'user' | 'assistant';

export interface MessageSource {
  type: 'doc' | 'code' | 'repo' | 'architecture';
  title: string;
  ref?: string;
}

export class ChatMessageModel extends BaseModel {
  static tableName = 'chat_messages';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  sessionId!: string;
  role!: MessageRole;
  content!: string;
  sources!: MessageSource[] | null;
  interrupted!: boolean;
  createdAt!: Date;
}
