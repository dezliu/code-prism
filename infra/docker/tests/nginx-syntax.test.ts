import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const nginxDir = path.join(repoRoot, 'infra/nginx');

function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  return result.status === 0;
}

describe('nginx config syntax', () => {
  it.skipIf(!isDockerAvailable())('passes nginx -t when validated in container', () => {
    const result = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--entrypoint',
        'nginx',
        '-v',
        `${nginxDir}/nginx.conf:/etc/nginx/nginx.conf:ro`,
        '-v',
        `${nginxDir}/conf.d:/etc/nginx/conf.d:ro`,
        'nginx:1.27-alpine',
        '-t',
      ],
      { encoding: 'utf8' },
    );

    const output = `${result.stdout}${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(`nginx -t failed: ${output}`);
    }

    expect(output).toContain('syntax is ok');
    expect(output).toContain('test is successful');
  });
});
