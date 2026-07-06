import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiConfig } from '../../config.js';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') {
    return DEFAULT_DEV_ORIGINS;
  }
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function createCorsMiddleware(config: ApiConfig): RequestHandler {
  const allowedOrigins = new Set(config.corsOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Apollo-Require-Preflight',
    );
    res.setHeader('Access-Control-Expose-Headers', 'X-Stream-Id');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
