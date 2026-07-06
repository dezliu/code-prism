import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, extractBearerToken } from './jwt';
import type { ApiConfig } from '../../config';

const config: ApiConfig = {
  port: 4000,
  nodeEnv: 'test',
  logLevel: 'error',
  databaseUrl: 'mysql://test:test@localhost:3306/test',
  redisUrl: 'redis://localhost:6379/0',
  coreGrpcAddr: 'localhost:50051',
  aiWorkerUrl: 'http://localhost:8001',
  jwtSecret: 'test-secret-key',
  jwtExpiresIn: '1h',
};

describe('jwt', () => {
  it('should sign and verify access token', () => {
    const token = signAccessToken(config, { userId: 'user-1', role: 'employee' });
    const payload = verifyAccessToken(config, token);
    expect(payload).toEqual({ userId: 'user-1', role: 'employee' });
  });

  it('should extract bearer token from header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});
