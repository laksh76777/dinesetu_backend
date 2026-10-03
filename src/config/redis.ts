import { logger } from '../utils/logger.js';

interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  flushall(): Promise<'OK'>;
}

class InMemoryCache implements CacheClient {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK' | null> {
    let expiry: number | undefined;
    if (mode === 'EX' && duration) {
      expiry = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
}

let cacheInstance: CacheClient = new InMemoryCache();

export async function initRedis(): Promise<CacheClient> {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { Redis } = await import('ioredis');
      const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      });

      await new Promise<void>((resolve, reject) => {
        redis.once('connect', () => {
          logger.info('Connected to Redis server');
          cacheInstance = redis as unknown as CacheClient;
          resolve();
        });
        redis.once('error', (err) => {
          logger.warn(`Redis connection error (${err.message}). Using in-memory cache.`);
          cacheInstance = new InMemoryCache();
          resolve(); // gracefully resolve to continue
        });
      });
    } catch (err: any) {
      logger.warn(`Could not initialize Redis client (${err.message}). Using in-memory cache.`);
      cacheInstance = new InMemoryCache();
    }
  } else {
    logger.info('No REDIS_URL provided. Using ultra-fast in-memory cache.');
    cacheInstance = new InMemoryCache();
  }

  return cacheInstance;
}

export function getCache(): CacheClient {
  return cacheInstance;
}
