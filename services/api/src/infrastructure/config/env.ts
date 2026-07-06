import { config as loadEnvFile } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** Load repo root, docker overlay, then cwd — later files do not override earlier unless using override:true */
export function loadProjectEnv(): void {
  loadEnvFile({ path: path.join(repoRoot, '.env') });
  loadEnvFile({ path: path.join(repoRoot, 'infra/docker/.env') });
  loadEnvFile();
}

export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const port = process.env.MYSQL_HOST_PORT ?? '3306';
  const user = process.env.MYSQL_USER ?? 'lingprism';
  const password = process.env.MYSQL_PASSWORD ?? 'lingprism';
  const database = process.env.MYSQL_DATABASE ?? 'lingprism';

  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/${database}`;
}

export function resolveRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const port = process.env.REDIS_HOST_PORT ?? '6379';
  return `redis://localhost:${port}/0`;
}

export function parseDatabaseEndpoint(databaseUrl: string): { host: string; port: number; database: string } {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    database: parsed.pathname.replace(/^\//, ''),
  };
}
