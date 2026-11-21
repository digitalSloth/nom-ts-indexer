import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';

let mockDb: MockKnex;

const zenonClient = {
  getSDK: vi.fn(),
};

vi.mock('../../../src/services/zenon-client.js', () => ({ zenonClient }));
vi.mock('../../../src/database/knex.js', () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock('../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: vi.fn().mockResolvedValue(1),
  },
}));

const { tokenRegistry } = await import('../../../src/services/registries/token-registry.js');
const { accountRegistry } = await import('../../../src/services/registries/account-registry.js');

describe('TokenRegistry', () => {
  beforeEach(() => {
    mockDb = makeMockKnex();
    tokenRegistry.clear();
    vi.mocked(accountRegistry.getOrCreate).mockReset();
    vi.mocked(accountRegistry.getOrCreate).mockResolvedValue(1);
  });

  it('returns undefined for cache miss before any loads', () => {
    expect(tokenRegistry.get('zts1abc')).toBeUndefined();
  });

  it('set and get work', () => {
    tokenRegistry.set('zts1abc', 42);
    expect(tokenRegistry.get('zts1abc')).toBe(42);
  });

  it('clear resets the cache', () => {
    tokenRegistry.set('zts1abc', 1);
    tokenRegistry.clear();
    expect(tokenRegistry.get('zts1abc')).toBeUndefined();
  });

  it('getOrLoad returns null for null/undefined input', async () => {
    expect(await tokenRegistry.getOrLoad(mockDb, null)).toBeNull();
    expect(await tokenRegistry.getOrLoad(mockDb, undefined)).toBeNull();
  });

  it('getOrLoad returns cached value on hit', async () => {
    tokenRegistry.set('zts1abc', 99);
    const id = await tokenRegistry.getOrLoad(mockDb, 'zts1abc');
    expect(id).toBe(99);
  });

  it('getOrLoad returns existing DB token on cache miss', async () => {
    mockDb.resolveNext({ id: 55 });

    const id = await tokenRegistry.getOrLoad(mockDb, 'zts1existing');

    expect(id).toBe(55);
    expect(tokenRegistry.get('zts1existing')).toBe(55);
    expect(zenonClient.getSDK).not.toHaveBeenCalled();
  });

  it('getOrLoad fetches from RPC and upserts when not in DB', async () => {
    const zts = 'zts1znnxxxxxxxxxxxxx9z4ulx';
    // First call (findUnique) returns null, second (upsert) returns id
    mockDb.resolveNext(null);
    mockDb.resolveNext({ id: 77 });

    const mockTokenData = {
      owner: { toString: () => 'z1owner' },
      name: 'TestToken',
      symbol: 'TST',
      domain: 'test.znn',
      tokenStandard: { toString: () => zts },
      totalSupply: { toString: () => '1000000' },
      maxSupply: { toString: () => '10000000' },
      decimals: 8,
      isBurnable: true,
      isMintable: true,
      isUtility: false,
    };

    const mockSDK = {
      embedded: {
        token: {
          getByZts: vi.fn().mockResolvedValue(mockTokenData),
        },
      },
    };
    zenonClient.getSDK.mockReturnValue(mockSDK);

    const id = await tokenRegistry.getOrLoad(mockDb, zts);

    expect(id).toBe(77);
    expect(accountRegistry.getOrCreate).toHaveBeenCalledWith(mockDb, 'z1owner');
    expect(tokenRegistry.get(zts)).toBe(77);
    // The node reports no initial supply or issue time.
    const inserted = mockDb.lastBuilder().insert.mock.calls[0][0];
    expect(inserted.initial_supply).toBeNull();
    expect(inserted).not.toHaveProperty('created_at');
  });

  it('getOrLoad returns null when RPC returns no data', async () => {
    const zts = 'zts1qsrxxxxxxxxxxxxxmrhjll';
    mockDb.resolveNext(null);

    const mockSDK = {
      embedded: {
        token: {
          getByZts: vi.fn().mockResolvedValue(null),
        },
      },
    };
    zenonClient.getSDK.mockReturnValue(mockSDK);

    const id = await tokenRegistry.getOrLoad(mockDb, zts);
    expect(id).toBeNull();
  });
});
