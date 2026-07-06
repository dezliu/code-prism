import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiConfig } from '../../config.js';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:8080',
];

/** Mirror localhost ↔ 127.0.0.1 so dev works regardless of browser URL bar host. */
export function expandOriginAliases(origins: string[]): string[] {
  const expanded = new Set(origins);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      const port = url.port ? `:${url.port}` : '';
      if (url.hostname === 'localhost') {
        expanded.add(`${url.protocol}//127.0.0.1${port}`);
      } else if (url.hostname === '127.0.0.1') {
        expanded.add(`${url.protocol}//localhost${port}`);
      }
    } catch {
      // ignore malformed origins
    }
  }
  return [...expanded];
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  const base =
    !raw || raw.trim() === ''
      ? DEFAULT_DEV_ORIGINS
      : raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  return expandOriginAliases(base);
}

export function createCorsMiddleware(config: ApiConfig): RequestHandler {
  const allowedOrigins = new Set(expandOriginAliases(config.corsOrigins));

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
