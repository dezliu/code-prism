import type { Knex } from 'knex';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// Load env from repo root and docker overlay (infra/migrations has no local .env)
loadEnv({ path: path.join(repoRoot, '.env') });
loadEnv({ path: path.join(repoRoot, 'infra/docker/.env') });

const mysqlHostPort = process.env.MYSQL_HOST_PORT ?? '3306';
const databaseUrl =
  process.env.DATABASE_URL ??
  `mysql://lingprism:lingprism@localhost:${mysqlHostPort}/lingprism`;

function parseConnection(url: string): Knex.StaticConnectionConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

const connection = parseConnection(databaseUrl);

const knexConfig: Knex.Config = {
  client: 'mysql2',
  connection,
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export default knexConfig;
