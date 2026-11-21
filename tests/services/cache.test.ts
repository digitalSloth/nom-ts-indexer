import { describe, it, expect, beforeEach, vi } from 'vitest';

const ctorSpy = vi.fn();
const onSpy = vi.fn();
const quitSpy = vi.fn(async () => 'OK');

class MockRedis {
  constructor(opts: any) {
    ctorSpy(opts);
  }
  on(event: string, handler: (...args: any[]) => void) {
    onSpy(event, handler);
    return this;
  }
  async quit() {
    return quitSpy();
  }
}

vi.mock('ioredis', () => ({
  default: MockRedis,
}));

let cacheService: typeof import('../../src/services/cache.js').cacheService;

beforeEach(async () => {
  vi.resetModules();
  ctorSpy.mockClear();
  onSpy.mockClear();
  quitSpy.mockClear();
  ({ cacheService } = await import('../../src/services/cache.js'));
});

describe('cacheService', () => {
  it('lazily constructs Redis client on first getClient and reads env', async () => {
    process.env.REDIS_HOST = 'redis-host';
    process.env.REDIS_PORT = '6390';
    process.env.REDIS_PASSWORD = 'pw';
    process.env.REDIS_DB = '2';
    process.env.REDIS_KEY_PREFIX = 'indexer:mainnet:';

    const c1 = cacheService.getClient();

    expect(ctorSpy).toHaveBeenCalledTimes(1);
    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'redis-host',
        port: 6390,
        password: 'pw',
        db: 2,
        keyPrefix: 'indexer:mainnet:',
      }),
    );
    expect(onSpy).toHaveBeenCalledWith('error', expect.any(Function));

    const c2 = cacheService.getClient();
    expect(c2).toBe(c1);
    expect(ctorSpy).toHaveBeenCalledTimes(1);
  });

  it('uses default env values when env vars are absent', async () => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;
    delete process.env.REDIS_KEY_PREFIX;

    cacheService.getClient();

    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        db: 0,
        keyPrefix: 'indexer:',
      }),
    );
  });

  it('disconnect() when no client exists does not throw', async () => {
    await expect(cacheService.disconnect()).resolves.not.toThrow();
  });

  it('disconnect quits and clears cached client so next getClient reconstructs', async () => {
    cacheService.getClient();
    expect(ctorSpy).toHaveBeenCalledTimes(1);

    await cacheService.disconnect();
    expect(quitSpy).toHaveBeenCalledTimes(1);

    cacheService.getClient();
    expect(ctorSpy).toHaveBeenCalledTimes(2);
  });
});
