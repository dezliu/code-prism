import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  CreateChatSessionUseCase,
  EnsureSessionTitleUseCase,
  GetSessionContextUseCase,
  PersistChatMessageUseCase,
} from './chat.use-cases.js';
import {
  pipeSseStream,
  StreamChatUseCase,
  writeSseEvent,
  type StreamChatInput,
} from './stream-chat.js';
import { deriveSessionTitle } from './session-title.js';
import type { SseEvent } from '../../infrastructure/clients/ai-worker.client.js';
import type { ContextAnchor } from '../../infrastructure/db/models/chat-session.model.js';
import type { MessageSource } from '../../infrastructure/db/models/chat-message.model.js';
import type { ListEnabledQaTemplatesUseCase } from '../template/template.use-cases.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';

export class ChatStreamOrchestrator {
  constructor(
    private readonly streamChat: StreamChatUseCase,
    private readonly createSession: CreateChatSessionUseCase,
    private readonly ensureSessionTitle: EnsureSessionTitleUseCase,
    private readonly getSessionContext: GetSessionContextUseCase,
    private readonly persistMessage: PersistChatMessageUseCase,
    private readonly listEnabledQaTemplates: ListEnabledQaTemplatesUseCase,
    private readonly repos: RepoRepository,
  ) {}

  async handle(input: {
    message: string;
    streamId: string;
    sessionId?: string;
    userId: string;
    res: Response;
  }): Promise<void> {
    const message = input.message.trim();
    if (!message) {
      writeSseEvent(input.res, {
        event: 'error',
        data: { code: 'VALIDATION_ERROR', message: 'message is required' },
      });
      return;
    }

    let sessionId = input.sessionId;
    let sessionTitle: string;

    if (!sessionId) {
      sessionTitle = deriveSessionTitle(message);
      const session = await this.createSession.execute(input.userId, sessionTitle);
      sessionId = session.id;
    } else {
      sessionTitle = await this.ensureSessionTitle.execute(sessionId, input.userId, message);
    }

    writeSseEvent(input.res, {
      event: 'session',
      data: { sessionId, title: sessionTitle },
    });

    writeSseEvent(input.res, {
      event: 'step',
      data: { node: 'persist_user', label: '保存消息…' },
    });

    await this.persistMessage.execute({
      sessionId,
      userId: input.userId,
      role: 'user',
      content: message,
    });

    writeSseEvent(input.res, {
      event: 'status',
      data: { phase: 'understanding' },
    });
    writeSseEvent(input.res, {
      event: 'step',
      data: { node: 'context', label: '加载会话上下文…' },
    });

    const sessionContext = await this.getSessionContext.execute(sessionId, input.userId);
    const qaTemplates = await this.listEnabledQaTemplates.execute();
    const allowedRepoIds = await this.repos.listIndexedRepoIds();
    const traceId = randomUUID();

    const streamInput: StreamChatInput = {
      message,
      streamId: input.streamId,
      sessionId,
      userId: input.userId,
      sessionContext: {
        anchor: sessionContext.anchor as Record<string, unknown> | null,
        recentMessages: sessionContext.recentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        qaTemplates,
        allowedRepoIds,
        traceId,
      },
    };

    let assistantContent = '';
    const sources: MessageSource[] = [];
    let interrupted = false;
    let anchor: ContextAnchor | null = sessionContext.anchor;

    async function* collectEvents(
      source: AsyncGenerator<SseEvent, void, unknown>,
    ): AsyncGenerator<SseEvent, void, unknown> {
      for await (const event of source) {
        if (event.event === 'token' && typeof event.data.text === 'string') {
          assistantContent += event.data.text;
        }
        if (event.event === 'source') {
          sources.push({
            type: String(event.data.type ?? 'doc') as MessageSource['type'],
            title: String(event.data.title ?? ''),
            ref: event.data.ref ? String(event.data.ref) : undefined,
          });
        }
        if (event.event === 'done') {
          interrupted = Boolean(event.data.interrupted);
          if (event.data.anchor && typeof event.data.anchor === 'object') {
            anchor = event.data.anchor as ContextAnchor;
          }
        }
        yield event;
      }
    }

    try {
      await pipeSseStream(input.res, collectEvents(this.streamChat.execute(streamInput)));
    } finally {
      if (assistantContent) {
        await this.persistMessage.execute({
          sessionId,
          userId: input.userId,
          role: 'assistant',
          content: assistantContent,
          sources,
          interrupted,
          anchor,
        });
      }
    }
  }
}

export function createStreamId(): string {
  return randomUUID();
}
