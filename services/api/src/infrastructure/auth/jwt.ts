import jwt from 'jsonwebtoken';
import type { ApiConfig } from '../../config.js';

export interface JwtPayload {
  userId: string;
  role: string;
}

export function signAccessToken(
  config: ApiConfig,
  payload: JwtPayload,
): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(
  config: ApiConfig,
  token: string,
): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('userId' in decoded) ||
    !('role' in decoded)
  ) {
    throw new Error('Invalid token payload');
  }
  return {
    userId: String(decoded.userId),
    role: String(decoded.role),
  };
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
