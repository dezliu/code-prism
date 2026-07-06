import { Router, type Response } from 'express';
import type { ApiConfig } from '../../config.js';
import { writeSseEvent } from '../../application/chat/stream-chat.js';
import { createStreamId } from '../../application/chat/chat-stream-orchestrator.js';
import { generateArchDraftEvents } from '../../application/architecture/arch-generate.orchestrator.js';
import {
  createJwtMiddleware,
  type AuthenticatedRequest,
} from '../auth/middleware.js';
import {
  MemoryStreamCancelStore,
  RedisStreamCancelStore,
  type StreamCancelStore,
} from '../clients/stream-cancel.store.js';
import { RepoRepository } from '../db/repositories/repo.repository.js';
import { MonitorRepository } from '../db/repositories/monitor.repository.js';
import { GraphSnapshotRepository } from '../db/repositories/graph-snapshot.repository.js';
import { createCoreHttpClient } from '../clients/core-http.client.js';
import { createAiWorkerArchClient } from '../clients/ai-worker-arch.client.js';
import { ApplicationError } from '../../domain/errors.js';

export interface ArchitectureRoutesDeps {
  config: ApiConfig;
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

export function createArchitectureRoutes(deps: ArchitectureRoutesDeps): Router {
  const router = Router();
  const jwtMiddleware = createJwtMiddleware(deps.config);
  const cancelStore = deps.cancelStore ?? new RedisStreamCancelStore(deps.config);
  const core = createCoreHttpClient();
  const aiArch = createAiWorkerArchClient(deps.config);

  router.post(
    '/api/architecture/generate/stream',
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

      const { repoId } = req.body as { repoId?: string };
      if (!repoId) {
        res.status(400).json({ code: 'VALIDATION_ERROR', message: 'repoId is required' });
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
        for await (const event of generateArchDraftEvents(
          {
            repos: new RepoRepository(),
            monitor: new MonitorRepository(),
            snapshots: new GraphSnapshotRepository(),
            core,
            aiArch,
            cancelStore,
          },
          { repoId, streamId },
        )) {
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
