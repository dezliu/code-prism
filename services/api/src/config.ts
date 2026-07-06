import 'dotenv/config';

export interface ApiConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  databaseUrl: string;
  redisUrl: string;
  coreGrpcAddr: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): ApiConfig {
  return {
    port: Number(process.env.API_PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    databaseUrl: requireEnv('DATABASE_URL', 'mysql://lingprism:lingprism@localhost:3306/lingprism'),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379/0'),
    coreGrpcAddr: requireEnv('CORE_GRPC_ADDR', 'localhost:50051'),
    jwtSecret: requireEnv('JWT_SECRET', 'change-me-in-production'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  };
}
