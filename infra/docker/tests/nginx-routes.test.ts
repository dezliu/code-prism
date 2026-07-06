import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const nginxConfPath = path.join(repoRoot, 'infra/nginx/conf.d/lingprism.conf');

function readNginxConf(): string {
  return readFileSync(nginxConfPath, 'utf8');
}

describe('nginx lingprism.conf routes', () => {
  const conf = readNginxConf();

  it('uses Docker embedded DNS resolver for deferred upstream lookup', () => {
    expect(conf).toContain('resolver 127.0.0.11');
  });

  it('routes /graphql to api service', () => {
    expect(conf).toMatch(/location\s+\/graphql\s*\{[\s\S]*?\$api_upstream\s+http:\/\/api:4000/);
    expect(conf).toMatch(/location\s+\/graphql\s*\{[\s\S]*?proxy_pass\s+\$api_upstream\/graphql/);
  });

  it('routes /api/chat/ to api with SSE-friendly settings', () => {
    expect(conf).toMatch(/location\s+\/api\/chat\/\s*\{[\s\S]*?proxy_pass\s+\$api_upstream\$request_uri/);
    expect(conf).toContain('proxy_buffering off');
    expect(conf).toContain('proxy_read_timeout 3600s');
  });

  it('routes /mcp to mcp service', () => {
    expect(conf).toMatch(/location\s+\/mcp\s*\{[\s\S]*?\$mcp_upstream\s+http:\/\/mcp:8090/);
    expect(conf).toContain('MCP-Protocol-Version');
  });

  it('exposes default localhost server on port 80', () => {
    expect(conf).toMatch(/server\s*\{[\s\S]*?listen\s+80\s+default_server/);
    expect(conf).toMatch(/server_name\s+localhost/);
  });

  it('defines virtual hosts for three frontends', () => {
    expect(conf).toContain('server_name user.localhost');
    expect(conf).toContain('server_name admin.localhost');
    expect(conf).toContain('server_name monitor.localhost');
    expect(conf).toMatch(/server_name user\.localhost[\s\S]*?\$user_upstream\s+http:\/\/user:3000/);
    expect(conf).toMatch(/server_name admin\.localhost[\s\S]*?\$admin_upstream\s+http:\/\/admin:3001/);
    expect(conf).toMatch(/server_name monitor\.localhost[\s\S]*?\$monitor_upstream\s+http:\/\/monitor:3002/);
  });

  it('defines dedicated api.localhost host', () => {
    expect(conf).toContain('server_name api.localhost');
  });
});
