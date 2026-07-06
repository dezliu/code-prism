import { describe, expect, it } from 'vitest';
import { CoreHttpClientStub } from './core-http.client';

describe('CoreHttpClientStub', () => {
  it('returns search hits for query', async () => {
    const client = new CoreHttpClientStub();
    const hits = await client.search('支付流程');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.type).toBe('doc');
  });

  it('enqueues index job', async () => {
    const client = new CoreHttpClientStub();
    const result = await client.enqueueIndex('repo-abc');
    expect(result.status).toBe('queued');
    expect(result.jobId).toContain('repo-abc'.slice(0, 8));
  });
});
