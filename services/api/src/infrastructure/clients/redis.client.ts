import { Redis } from 'ioredis';
import type { ApiConfig } from '../../config.js';

const CANCEL_KEY_PREFIX = 'lingprism:stream:cancel:';
const DEFAULT_CANCEL_TTL_SECONDS = 300;

let redisClient: Redis | null = null;

export function getRedisClient(config: ApiConfig): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }
  return redisClient;
}

export async function destroyRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export function cancelStreamKey(streamId: string): string {
  return `${CANCEL_KEY_PREFIX}${streamId}`;
}

export async function requestStreamCancel(
  config: ApiConfig,
  streamId: string,
): Promise<void> {
  const redis = getRedisClient(config);
  await redis.setex(cancelStreamKey(streamId), DEFAULT_CANCEL_TTL_SECONDS, '1');
}

export async function isStreamCancelled(
  config: ApiConfig,
  streamId: string,
): Promise<boolean> {
  const redis = getRedisClient(config);
  const exists = await redis.exists(cancelStreamKey(streamId));
  return exists === 1;
}
