import { loadProjectEnv, resolveDatabaseUrl, resolveRedisUrl } from './infrastructure/config/env.js';
import { parseCorsOrigins } from './infrastructure/http/cors.js';

loadProjectEnv();

export interface ApiConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  coreGrpcAddr: string;
  aiWorkerUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadCorsOrigins(): string[] {
  return parseCorsOrigins(process.env.CORS_ORIGINS, process.env.NODE_ENV ?? 'development');
}

export function loadConfig(): ApiConfig {
  return {
    port: Number(process.env.API_PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    databaseUrl: resolveDatabaseUrl(),
    redisUrl: resolveRedisUrl(),
    coreGrpcAddr: requireEnv('CORE_GRPC_ADDR', 'localhost:50051'),
    aiWorkerUrl: requireEnv('AI_WORKER_URL', 'http://localhost:8001'),
    jwtSecret: requireEnv('JWT_SECRET', 'change-me-in-production'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    corsOrigins: loadCorsOrigins(),
  };
}
