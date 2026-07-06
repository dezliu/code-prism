import { Router, type Response } from 'express';
import type { ApiConfig } from '../../config.js';
import { writeSseEvent } from '../../application/chat/stream-chat.js';
import { createStreamId, ChatStreamOrchestrator } from '../../application/chat/chat-stream-orchestrator.js';
import { PassthroughChatStreamOrchestrator } from '../../application/chat/passthrough-chat-orchestrator.js';
import { StreamChatUseCase } from '../../application/chat/stream-chat.js';
import {
  CreateChatSessionUseCase,
  EnsureSessionTitleUseCase,
  GetSessionContextUseCase,
  PersistChatMessageUseCase,
} from '../../application/chat/chat.use-cases.js';
import { ChatRepository } from '../db/repositories/chat.repository.js';
import { QaTemplateRepository } from '../db/repositories/qa-template.repository.js';
import { ListEnabledQaTemplatesUseCase } from '../../application/template/template.use-cases.js';
import {
  createJwtMiddleware,
  type AuthenticatedRequest,
} from '../auth/middleware.js';
import type { AiWorkerStreamClient } from '../clients/ai-worker.client.js';
import {
  MemoryStreamCancelStore,
  RedisStreamCancelStore,
  type StreamCancelStore,
} from '../clients/stream-cancel.store.js';

export interface ChatRoutesDeps {
  config: ApiConfig;
  aiWorkerClient: AiWorkerStreamClient;
  cancelStore?: StreamCancelStore;
  orchestrator?: ChatStreamOrchestrator | PassthroughChatStreamOrchestrator;
  usePersistence?: boolean;
}

export function createChatRoutes(deps: ChatRoutesDeps): Router {
  const router = Router();
  const jwtMiddleware = createJwtMiddleware(deps.config);
  const cancelStore = deps.cancelStore ?? new RedisStreamCancelStore(deps.config);
  const streamChatUseCase = new StreamChatUseCase(deps.aiWorkerClient, cancelStore);

  const chatRepo = new ChatRepository();
  const listEnabledQaTemplates = new ListEnabledQaTemplatesUseCase(new QaTemplateRepository());
  const orchestrator =
    deps.orchestrator ??
    (deps.usePersistence === false
      ? new PassthroughChatStreamOrchestrator(streamChatUseCase)
      : new ChatStreamOrchestrator(
          streamChatUseCase,
          new CreateChatSessionUseCase(chatRepo),
          new EnsureSessionTitleUseCase(chatRepo),
          new GetSessionContextUseCase(chatRepo),
          new PersistChatMessageUseCase(chatRepo),
          listEnabledQaTemplates,
        ));

  router.post(
    '/api/chat/stream',
    jwtMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const { message, sessionId } = req.body as {
        message?: string;
        sessionId?: string;
      };

      const streamId = createStreamId();
      const userId = req.auth!.userId;

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Stream-Id', streamId);
      res.flushHeaders?.();

      writeSseEvent(res, {
        event: 'status',
        data: { phase: 'understanding', streamId },
      });

      try {
        await orchestrator.handle({
          message: message ?? '',
          streamId,
          sessionId,
          userId,
          res,
        });
      } catch (error) {
        writeSseEvent(res, {
          event: 'error',
          data: {
            code: 'STREAM_ERROR',
            message: error instanceof Error ? error.message : 'Stream failed',
          },
        });
      } finally {
        res.end();
      }
    },
  );

  router.post(
    '/api/chat/stop',
    jwtMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const { streamId } = req.body as { streamId?: string };

      if (!streamId) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'streamId is required',
        });
        return;
      }

      await cancelStore.requestCancel(streamId);
      res.status(200).json({ ok: true, streamId });
    },
  );

  return router;
}

export { MemoryStreamCancelStore };
