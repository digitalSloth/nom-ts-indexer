import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';

let mockDb: MockKnex;

vi.mock('../../../src/database/knex.js', () => ({
  get db() {
    return mockDb;
  },
}));

const { accountRegistry } = await import('../../../src/services/registries/account-registry.js');

describe('AccountRegistry', () => {
  beforeEach(() => {
    accountRegistry.clear();
    mockDb = makeMockKnex();
  });

  it('starts empty', () => {
    expect(accountRegistry.size()).toBe(0);
    expect(accountRegistry.get('z1abc')).toBeUndefined();
  });

  it('set and get', () => {
    accountRegistry.set('z1abc', 42);
    expect(accountRegistry.get('z1abc')).toBe(42);
    expect(accountRegistry.size()).toBe(1);
  });

  it('set overwrites existing', () => {
    accountRegistry.set('z1abc', 1);
    accountRegistry.set('z1abc', 2);
    expect(accountRegistry.get('z1abc')).toBe(2);
    expect(accountRegistry.size()).toBe(1);
  });

  it('clear resets the cache', () => {
    accountRegistry.set('z1abc', 1);
    accountRegistry.clear();
    expect(accountRegistry.size()).toBe(0);
  });

  it('getOrCreate returns cached value on hit', async () => {
    accountRegistry.set('z1abc', 99);

    const id = await accountRegistry.getOrCreate(mockDb, 'z1abc');

    expect(id).toBe(99);
    // Should not have called the DB at all
    expect(mockDb.lastBuilder).toBeDefined();
  });

  it('getOrCreate inserts on cache miss', async () => {
    mockDb.resolveNext({ id: 55 });

    const id = await accountRegistry.getOrCreate(mockDb, 'z1new');

    expect(id).toBe(55);
    expect(accountRegistry.get('z1new')).toBe(55);

    const builder = mockDb.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    expect(builder.onConflict).toHaveBeenCalled();
    expect(builder.merge).toHaveBeenCalled();
    expect(builder.returning).toHaveBeenCalled();
  });

  it('LRU eviction removes oldest entry when at capacity', () => {
    accountRegistry.set('a', 1);
    accountRegistry.set('b', 2);

    // Access 'a' to make it recently used
    accountRegistry.get('a');

    // Add 'c' — should evict 'b' (least recently used)
    accountRegistry.set('c', 3);

    expect(accountRegistry.get('a')).toBe(1);
    expect(accountRegistry.get('c')).toBe(3);
  });
});
