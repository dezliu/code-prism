import { Router, type Request, type Response } from 'express';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
