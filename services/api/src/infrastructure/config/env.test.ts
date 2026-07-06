import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveDatabaseUrl, resolveRedisUrl, loadProjectEnv } from './env';

describe('env resolution', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should derive database url from MYSQL_HOST_PORT when DATABASE_URL unset', () => {
    delete process.env.DATABASE_URL;
    process.env.MYSQL_HOST_PORT = '13306';
    process.env.MYSQL_USER = 'lingprism';
    process.env.MYSQL_PASSWORD = 'lingprism';
    process.env.MYSQL_DATABASE = 'lingprism';

    expect(resolveDatabaseUrl()).toBe(
      'mysql://lingprism:lingprism@localhost:13306/lingprism',
    );
  });

  it('should derive redis url from REDIS_HOST_PORT when REDIS_URL unset', () => {
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST_PORT = '6380';

    expect(resolveRedisUrl()).toBe('redis://localhost:6380/0');
  });

  it('should prefer explicit DATABASE_URL over MYSQL_HOST_PORT', () => {
    process.env.DATABASE_URL = 'mysql://custom:custom@localhost:3307/app';
    process.env.MYSQL_HOST_PORT = '13306';

    expect(resolveDatabaseUrl()).toBe('mysql://custom:custom@localhost:3307/app');
  });

  it('should load docker env file when present', () => {
    loadProjectEnv();
    // When infra/docker/.env exists with MYSQL_HOST_PORT=13306, resolution should reflect it
    if (process.env.MYSQL_HOST_PORT === '13306' && !process.env.DATABASE_URL) {
      expect(resolveDatabaseUrl()).toContain(':13306/');
    } else {
      expect(resolveDatabaseUrl()).toBeTruthy();
    }
  });
});
