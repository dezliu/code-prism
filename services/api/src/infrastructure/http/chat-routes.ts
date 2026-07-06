import { Router, type Request, type Response } from 'express';

/**
 * SSE 流式问答路由占位 — Batch 3 sse-chat-stream 实现
 * @see docs/api-contracts/sse-chat-events.md
 */
export function createChatRoutes(): Router {
  const router = Router();

  router.post('/api/chat/stream', (_req: Request, res: Response) => {
    res.status(501).json({
      code: 'NOT_IMPLEMENTED',
      message: 'SSE chat stream will be implemented in Batch 3',
    });
  });

  router.post('/api/chat/stop', (_req: Request, res: Response) => {
    res.status(501).json({
      code: 'NOT_IMPLEMENTED',
      message: 'SSE chat stop will be implemented in Batch 3',
    });
  });

  return router;
}
