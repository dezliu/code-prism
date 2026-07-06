import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiConfig } from '../../config.js';
import {
  pipeSseStream,
  StreamChatUseCase,
  writeSseEvent,
} from '../../application/chat/stream-chat.js';
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
}

export function createChatRoutes(deps: ChatRoutesDeps): Router {
  const router = Router();
  const jwtMiddleware = createJwtMiddleware(deps.config);
  const cancelStore = deps.cancelStore ?? new RedisStreamCancelStore(deps.config);
  const streamChatUseCase = new StreamChatUseCase(deps.aiWorkerClient, cancelStore);

  router.post(
    '/api/chat/stream',
    jwtMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const { message, sessionId } = req.body as {
        message?: string;
        sessionId?: string;
      };

      const streamId = randomUUID();
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
        await pipeSseStream(
          res,
          streamChatUseCase.execute({
            message: message ?? '',
            streamId,
            sessionId,
            userId,
          }),
        );
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
