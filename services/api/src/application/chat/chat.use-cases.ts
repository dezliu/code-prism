import { NotFoundError } from '../../domain/errors.js';
import { ChatRepository } from '../../infrastructure/db/repositories/chat.repository.js';
import type { ContextAnchor } from '../../infrastructure/db/models/chat-session.model.js';
import type { MessageSource } from '../../infrastructure/db/models/chat-message.model.js';

export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  anchor: ContextAnchor | null;
}

export interface ChatMessageSummary {
  id: string;
  role: string;
  content: string;
  sources: MessageSource[] | null;
  interrupted: boolean;
  createdAt: string;
}

export class ListChatSessionsUseCase {
  constructor(private readonly chat: ChatRepository) {}

  async execute(userId: string): Promise<ChatSessionSummary[]> {
    const sessions = await this.chat.listSessionsByUser(userId);
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt.toISOString(),
      anchor: s.anchor,
    }));
  }
}

export class CreateChatSessionUseCase {
  constructor(private readonly chat: ChatRepository) {}

  async execute(userId: string, title?: string): Promise<ChatSessionSummary> {
    const session = await this.chat.createSession(userId, title);
    return {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt.toISOString(),
      anchor: session.anchor,
    };
  }
}

export class GetChatMessagesUseCase {
  constructor(private readonly chat: ChatRepository) {}

  async execute(sessionId: string, userId: string): Promise<ChatMessageSummary[]> {
    const session = await this.chat.findSession(sessionId, userId);
    if (!session) {
      throw new NotFoundError('ChatSession', sessionId);
    }
    const messages = await this.chat.listMessages(sessionId);
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sources: m.sources,
      interrupted: m.interrupted,
      createdAt: m.createdAt.toISOString(),
    }));
  }
}

export class PersistChatMessageUseCase {
  constructor(private readonly chat: ChatRepository) {}

  async execute(input: {
    sessionId: string;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    sources?: MessageSource[];
    interrupted?: boolean;
    anchor?: ContextAnchor | null;
  }): Promise<ChatMessageSummary> {
    const session = await this.chat.findSession(input.sessionId, input.userId);
    if (!session) {
      throw new NotFoundError('ChatSession', input.sessionId);
    }
    const message = await this.chat.addMessage(input);
    if (input.anchor !== undefined) {
      await this.chat.updateAnchor(input.sessionId, input.anchor);
    }
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      sources: message.sources,
      interrupted: message.interrupted,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

export class GetSessionContextUseCase {
  constructor(private readonly chat: ChatRepository) {}

  async execute(sessionId: string, userId: string): Promise<{
    anchor: ContextAnchor | null;
    recentMessages: ChatMessageSummary[];
  }> {
    const session = await this.chat.findSession(sessionId, userId);
    if (!session) {
      throw new NotFoundError('ChatSession', sessionId);
    }
    const messages = await this.chat.listMessages(sessionId);
    const recent = messages.slice(-10);
    return {
      anchor: session.anchor,
      recentMessages: recent.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources,
        interrupted: m.interrupted,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
