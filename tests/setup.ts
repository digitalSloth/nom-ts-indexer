import { vi, beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'test';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'test';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'test';
process.env.ZNN_RPC_URL = process.env.ZNN_RPC_URL || 'http://localhost:35997';
process.env.ZNN_WS_URL = process.env.ZNN_WS_URL || 'ws://localhost:35998';
process.env.CHAIN_ID = process.env.CHAIN_ID || '1';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
