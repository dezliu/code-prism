import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const composePath = path.join(repoRoot, 'infra/docker/docker-compose.yml');

interface ComposeFile {
  services: Record<
    string,
    {
      profiles?: string[];
      build?: { dockerfile?: string; context?: string; args?: Record<string, string> };
      image?: string;
      depends_on?: Record<string, { condition?: string }> | string[];
      ports?: string[];
      volumes?: string[];
    }
  >;
}

function readCompose(): ComposeFile {
  return parse(readFileSync(composePath, 'utf8')) as ComposeFile;
}

describe('docker-compose.yml full stack', () => {
  const compose = readCompose();
  const services = compose.services;

  it('keeps data layer services without profile', () => {
    for (const name of ['mysql', 'redis', 'neo4j', 'qdrant', 'opensearch']) {
      expect(services[name]).toBeDefined();
      expect(services[name].profiles ?? []).toHaveLength(0);
    }
  });

  it('defines app profile services with Dockerfiles', () => {
    const appServices = ['migrate', 'api', 'core', 'ai-worker', 'mcp', 'user', 'admin', 'monitor'];
    for (const name of appServices) {
      const svc = services[name];
      expect(svc, `missing service ${name}`).toBeDefined();
      expect(svc.profiles).toContain('app');
      expect(svc.build?.dockerfile).toMatch(/^infra\/docker\/Dockerfile\./);
      expect(svc.build?.context).toBe('../..');
    }
  });

  it('nginx uses infra/nginx config mounts and exposes host port', () => {
    const nginx = services.nginx;
    expect(nginx.profiles).toContain('app');
    expect(nginx.image).toContain('nginx');
    expect(nginx.ports?.some((p) => p.includes('8080:80') || p.includes('${NGINX_HOST_PORT'))).toBe(true);
    expect(nginx.volumes?.some((v) => v.includes('nginx.conf'))).toBe(true);
    expect(nginx.volumes?.some((v) => v.includes('conf.d'))).toBe(true);
  });

  it('api depends on migrate completion and ai-worker health', () => {
    const dependsOn = services.api.depends_on as Record<string, { condition?: string }>;
    expect(dependsOn.migrate.condition).toBe('service_completed_successfully');
    expect(dependsOn['ai-worker'].condition).toBe('service_healthy');
  });

  it('frontends receive NEXT_PUBLIC build args', () => {
    for (const name of ['user', 'admin', 'monitor']) {
      const args = services[name].build?.args ?? {};
      expect(args.NEXT_PUBLIC_GRAPHQL_URL).toBeDefined();
      expect(args.NEXT_PUBLIC_API_BASE_URL).toBeDefined();
    }
  });

  it('includes celery worker as separate service', () => {
    const celery = services['ai-worker-celery'];
    expect(celery.profiles).toContain('app');
    expect(celery.command).toContain('celery');
  });
});

describe('Dockerfile inventory', () => {
  const dockerfiles = [
    'Dockerfile.api',
    'Dockerfile.core',
    'Dockerfile.indexer',
    'Dockerfile.mcp',
    'Dockerfile.ai-worker',
    'Dockerfile.frontend',
    'Dockerfile.migrate',
  ];

  it.each(dockerfiles)('%s exists', (file) => {
    const fullPath = path.join(repoRoot, 'infra/docker', file);
    expect(() => readFileSync(fullPath, 'utf8')).not.toThrow();
  });
});
