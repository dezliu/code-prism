import type { NextFunction, Request, Response } from 'express';
import type { ApiConfig } from '../../config.js';
import { extractBearerToken, verifyAccessToken, type JwtPayload } from './jwt.js';

export interface AuthenticatedRequest extends Request {
  auth?: JwtPayload;
}

export function createJwtMiddleware(config: ApiConfig) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
      return;
    }

    try {
      req.auth = verifyAccessToken(config, token);
      next();
    } catch {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }
  };
}

export function optionalJwtMiddleware(config: ApiConfig) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req.headers.authorization);
    if (token) {
      try {
        req.auth = verifyAccessToken(config, token);
      } catch {
        // ignore invalid token for optional auth
      }
    }
    next();
  };
}
