import { randomUUID } from 'node:crypto';
import {
  ChatSessionModel,
  type ContextAnchor,
} from '../models/chat-session.model.js';
import {
  ChatMessageModel,
  type CodeLocationRecord,
  type MessageSource,
} from '../models/chat-message.model.js';

export class ChatRepository {
  async listSessionsByUser(userId: string): Promise<ChatSessionModel[]> {
    return ChatSessionModel.query()
      .where('user_id', userId)
      .orderBy('updated_at', 'desc');
  }

  async findSession(id: string, userId: string): Promise<ChatSessionModel | undefined> {
    return ChatSessionModel.query().findById(id).where('user_id', userId);
  }

  async createSession(userId: string, title?: string): Promise<ChatSessionModel> {
    const id = randomUUID();
    return ChatSessionModel.query().insertAndFetch({
      id,
      userId,
      title: title?.trim() || '新会话',
      anchor: null,
    });
  }

  async updateAnchor(sessionId: string, anchor: ContextAnchor | null): Promise<void> {
    await ChatSessionModel.query().findById(sessionId).patch({
      anchor,
      updatedAt: new Date(),
    });
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    await ChatSessionModel.query().findById(sessionId).patch({
      title: title.trim() || '新会话',
      updatedAt: new Date(),
    });
  }

  async listMessages(sessionId: string): Promise<ChatMessageModel[]> {
    return ChatMessageModel.query()
      .where('session_id', sessionId)
      .orderBy('created_at', 'asc');
  }

  async deleteSession(sessionId: string, userId: string): Promise<number> {
    return ChatSessionModel.query()
      .delete()
      .where('id', sessionId)
      .where('user_id', userId);
  }

  async addMessage(input: {
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: MessageSource[];
    codeLocations?: CodeLocationRecord[];
    interrupted?: boolean;
  }): Promise<ChatMessageModel> {
    const id = randomUUID();
    await ChatSessionModel.query().findById(input.sessionId).patch({
      updatedAt: new Date(),
    });
    return ChatMessageModel.query().insertAndFetch({
      id,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      sources: input.sources ?? null,
      codeLocations: input.codeLocations ?? null,
      interrupted: input.interrupted ?? false,
    });
  }
}
