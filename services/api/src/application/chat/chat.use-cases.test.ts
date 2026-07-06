import { describe, expect, it } from 'vitest';
import {
  CreateChatSessionUseCase,
  DeleteChatSessionUseCase,
} from './chat.use-cases';
import type { ChatRepository } from '../../infrastructure/db/repositories/chat.repository.js';
import type { ChatSessionModel } from '../../infrastructure/db/models/chat-session.model.js';

function createMockChatRepo(): ChatRepository {
  const sessions = new Map<string, ChatSessionModel>();

  return {
    listSessionsByUser: async (userId: string) =>
      [...sessions.values()].filter((s) => s.userId === userId),
    findSession: async (id: string, userId: string) =>
      sessions.get(id)?.userId === userId ? sessions.get(id) : undefined,
    createSession: async (userId: string, title?: string) => {
      const session = {
        id: `session-${sessions.size + 1}`,
        userId,
        title: title?.trim() || '新会话',
        anchor: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ChatSessionModel;
      sessions.set(session.id, session);
      return session;
    },
    updateAnchor: async () => {},
    listMessages: async () => [],
    deleteSession: async (sessionId: string, userId: string) => {
      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) {
        return 0;
      }
      sessions.delete(sessionId);
      return 1;
    },
    addMessage: async () => {
      throw new Error('not implemented');
    },
  } as unknown as ChatRepository;
}

describe('DeleteChatSessionUseCase', () => {
  it('deletes session owned by user', async () => {
    const repo = createMockChatRepo();
    const created = await new CreateChatSessionUseCase(repo).execute('user-1', '测试会话');
    const ok = await new DeleteChatSessionUseCase(repo).execute(created.id, 'user-1');
    expect(ok).toBe(true);
    expect(await repo.findSession(created.id, 'user-1')).toBeUndefined();
  });

  it('rejects deleting session owned by another user', async () => {
    const repo = createMockChatRepo();
    const created = await new CreateChatSessionUseCase(repo).execute('user-1');
    await expect(
      new DeleteChatSessionUseCase(repo).execute(created.id, 'user-2'),
    ).rejects.toThrow('ChatSession');
  });
});
