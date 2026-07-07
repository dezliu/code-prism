import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export type MessageRole = 'user' | 'assistant';

export interface MessageSource {
  type: 'doc' | 'code' | 'repo' | 'architecture';
  title: string;
  ref?: string;
}

export interface CodeLocationRecord {
  repoId: string;
  repoName: string;
  repoUrl: string;
  filePath: string;
  language?: string;
  packageName?: string;
  className?: string;
  methodName: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  docComment?: string;
  qualifiedRef: string;
  snippet?: string;
  score?: number;
}

export class ChatMessageModel extends BaseModel {
  static tableName = 'chat_messages';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  sessionId!: string;
  role!: MessageRole;
  content!: string;
  sources!: MessageSource[] | null;
  codeLocations!: CodeLocationRecord[] | null;
  interrupted!: boolean;
  createdAt!: Date;

  static get jsonAttributes() {
    return ['sources', 'codeLocations'];
  }
}
