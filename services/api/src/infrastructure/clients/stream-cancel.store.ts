import type { ApiConfig } from '../../config.js';

export interface StreamCancelStore {
  requestCancel(streamId: string): Promise<void>;
  isCancelled(streamId: string): Promise<boolean>;
}

export class RedisStreamCancelStore implements StreamCancelStore {
  constructor(private readonly config: ApiConfig) {}

  private async getRedis() {
    const { getRedisClient } = await import('./redis.client.js');
    return getRedisClient(this.config);
  }

  async requestCancel(streamId: string): Promise<void> {
    const { requestStreamCancel } = await import('./redis.client.js');
    await requestStreamCancel(this.config, streamId);
  }

  async isCancelled(streamId: string): Promise<boolean> {
    const { isStreamCancelled } = await import('./redis.client.js');
    return isStreamCancelled(this.config, streamId);
  }
}

/** In-memory store for unit tests — no Redis required. */
export class MemoryStreamCancelStore implements StreamCancelStore {
  private readonly cancelled = new Set<string>();

  async requestCancel(streamId: string): Promise<void> {
    this.cancelled.add(streamId);
  }

  async isCancelled(streamId: string): Promise<boolean> {
    return this.cancelled.has(streamId);
  }
}
