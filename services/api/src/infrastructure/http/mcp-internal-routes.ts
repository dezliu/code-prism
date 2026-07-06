import { Router, type Request, type Response } from 'express';
import type { ApiConfig } from '../../config.js';
import { createStreamId, ChatStreamOrchestrator } from '../../application/chat/chat-stream-orchestrator.js';
import { StreamChatUseCase } from '../../application/chat/stream-chat.js';
import {
  CreateChatSessionUseCase,
  EnsureSessionTitleUseCase,
  GetSessionContextUseCase,
  PersistChatMessageUseCase,
} from '../../application/chat/chat.use-cases.js';
import { ChatRepository } from '../db/repositories/chat.repository.js';
import { QaTemplateRepository } from '../db/repositories/qa-template.repository.js';
import { RepoRepository } from '../db/repositories/repo.repository.js';
import { ListEnabledQaTemplatesUseCase } from '../../application/template/template.use-cases.js';
import type { AiWorkerStreamClient } from '../clients/ai-worker.client.js';
import type { StreamCancelStore } from '../clients/stream-cancel.store.js';
import { writeSseEvent } from '../../application/chat/stream-chat.js';

export interface McpInternalRoutesDeps {
  config: ApiConfig;
  aiWorkerClient: AiWorkerStreamClient;
  cancelStore: StreamCancelStore;
}

function assertServiceToken(config: ApiConfig, req: Request): boolean {
  const token = config.mcpServiceToken;
  if (!token) {
    return false;
  }
  const header = req.header('X-Service-Token') ?? req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  return header === token;
}

export function createMcpInternalRoutes(deps: McpInternalRoutesDeps): Router {
  const router = Router();
  const streamChatUseCase = new StreamChatUseCase(deps.aiWorkerClient, deps.cancelStore);
  const chatRepo = new ChatRepository();
  const orchestrator = new ChatStreamOrchestrator(
    streamChatUseCase,
    new CreateChatSessionUseCase(chatRepo),
    new EnsureSessionTitleUseCase(chatRepo),
    new GetSessionContextUseCase(chatRepo),
    new PersistChatMessageUseCase(chatRepo),
    new ListEnabledQaTemplatesUseCase(new QaTemplateRepository()),
    new RepoRepository(),
  );

  router.post('/internal/mcp/ask', async (req: Request, res: Response) => {
    if (!assertServiceToken(deps.config, req)) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'invalid service token' });
      return;
    }

    const { question, userId, sessionId } = req.body as {
      question?: string;
      userId?: string;
      sessionId?: string;
    };

    if (!question?.trim()) {
      res.status(400).json({ code: 'VALIDATION_ERROR', message: 'question is required' });
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
      await orchestrator.handle({
        message: question.trim(),
        streamId,
        sessionId,
        userId: userId ?? 'mcp-agent',
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
  });

  return router;
}
