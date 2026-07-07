import { Router, type Response } from 'express';
import type { ApiConfig } from '../../config.js';
import { StreamResolveSymbolsUseCase } from '../../application/search/stream-resolve-symbols.use-case.js';
import { CoreHttpClientImpl } from '../clients/core-http.client.js';
import {
  createJwtMiddleware,
  type AuthenticatedRequest,
} from '../auth/middleware.js';

export interface SymbolResolveStreamRoutesDeps {
  config: ApiConfig;
}

/**
 * 创建符号解析流式路由
 * 
 * POST /api/symbols/resolve-stream
 * 通过 SSE 返回渐进式检索结果
 */
export function createSymbolResolveStreamRoutes(deps: SymbolResolveStreamRoutesDeps): Router {
  const router = Router();
  const jwtMiddleware = createJwtMiddleware(deps.config);
  const coreClient = new CoreHttpClientImpl(deps.config);
  const streamResolveUseCase = new StreamResolveSymbolsUseCase(coreClient);

  router.post(
    '/api/symbols/resolve-stream',
    jwtMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const { query, className, methodName, repoIds, limit } = req.body as {
        query?: string;
        className?: string;
        methodName?: string;
        repoIds?: string[];
        limit?: number;
      };

      if (!query || !query.trim()) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }

      // 设置 SSE headers
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Nginx 缓冲禁用
      res.flushHeaders?.();

      try {
        const { events } = await streamResolveUseCase.execute({
          query: query.trim(),
          className,
          methodName,
          repoIds,
          limit,
        });

        // 流式写入事件
        for await (const event of events) {
          const dataStr = JSON.stringify(event.data);
          res.write(`event: ${event.event}\n`);
          res.write(`data: ${dataStr}\n\n`);
          
          // 如果是 done 或 error 事件，结束响应
          if (event.event === 'done' || event.event === 'error') {
            res.end();
            return;
          }
        }

        // 如果没有收到 done 事件，手动结束
        res.end();
      } catch (error) {
        console.error('[SymbolResolveStream] Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.write(`event: error\n`);
        res.write(`data: {"error":"${errorMessage.replace(/"/g, '\\"')}"}\n\n`);
        res.end();
      }
    },
  );

  return router;
}
