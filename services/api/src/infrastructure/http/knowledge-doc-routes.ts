import { Router, type Response } from 'express';
import type { ApiConfig } from '../../config.js';
import { writeSseEvent } from '../../application/chat/stream-chat.js';
import { createStreamId } from '../../application/chat/chat-stream-orchestrator.js';
import { StreamGenerateKnowledgeDocUseCase } from '../../application/knowledge/knowledge-doc-stream.js';
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
import { KnowledgeDocRepository } from '../db/repositories/knowledge-doc.repository.js';
import { RepoRepository } from '../db/repositories/repo.repository.js';
import { createCoreHttpClient } from '../clients/core-http.client.js';
import { ApplicationError } from '../../domain/errors.js';

export interface KnowledgeDocRoutesDeps {
  config: ApiConfig;
  aiWorkerClient: AiWorkerStreamClient;
  cancelStore?: StreamCancelStore;
}

function requireAdmin(req: AuthenticatedRequest): void {
  if (!req.auth?.userId) {
    throw new ApplicationError('Authentication required', 'UNAUTHORIZED');
  }
  if (req.auth.role !== 'admin' && req.auth.role !== 'leader') {
    throw new ApplicationError('Admin access required', 'FORBIDDEN');
  }
}

export function createKnowledgeDocRoutes(deps: KnowledgeDocRoutesDeps): Router {
  const router = Router();
  const jwtMiddleware = createJwtMiddleware(deps.config);
  const cancelStore = deps.cancelStore ?? new RedisStreamCancelStore(deps.config);
  const core = createCoreHttpClient();
  const streamUseCase = new StreamGenerateKnowledgeDocUseCase(
    new KnowledgeDocRepository(),
    new RepoRepository(),
    core,
    deps.aiWorkerClient,
    cancelStore,
  );

  router.post(
    '/api/knowledge/doc/generate/stream',
    jwtMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        requireAdmin(req);
      } catch (error) {
        const appError = error instanceof ApplicationError ? error : null;
        res.status(appError?.code === 'FORBIDDEN' ? 403 : 401).json({
          code: appError?.code ?? 'UNAUTHORIZED',
          message: appError?.message ?? 'Unauthorized',
        });
        return;
      }

      const { docId, title, docType, repoIds } = req.body as {
        docId?: string;
        title?: string;
        docType?: string;
        repoIds?: string[];
      };

      if (!docId) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'docId is required' });
        return;
      }

      const streamId = createStreamId();

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Stream-Id', streamId);
      res.flushHeaders?.();

      try {
        for await (const event of streamUseCase.execute({
          docId,
          streamId,
          title,
          docType,
          repoIds,
        })) {
          writeSseEvent(res, event);
          if (event.event === 'done' || event.event === 'error') {
            break;
          }
        }
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

  return router;
}

export { MemoryStreamCancelStore };
