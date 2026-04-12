import IORedis, { RedisOptions } from 'ioredis';

class CacheService {
  private _client?: IORedis;

  private baseOptions(): RedisOptions {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    };
  }

  getClient(): IORedis {
    if (!this._client) {
      this._client = new IORedis(this.baseOptions());
      this._client.on('error', (err) => console.error('✗ Redis error:', err));
    }
    return this._client;
  }

  async disconnect(): Promise<void> {
    await this._client?.quit();
    this._client = undefined;
  }
}

export const cacheService = new CacheService();
