import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../helpers/mock-knex.js';

let mockDb: MockKnex;

vi.mock('../../src/database/knex.js', () => ({
  get db() {
    return mockDb;
  },
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

let databaseService: typeof import('../../src/services/database.js').databaseService;

beforeEach(async () => {
  vi.resetModules();
  mockDb = makeMockKnex();
  ({ databaseService } = await import('../../src/services/database.js'));
});

describe('databaseService', () => {
  describe('getIndexerState', () => {
    it('returns existing state when present', async () => {
      const state = { id: 1, last_indexed_momentum: BigInt(5), is_running: false };
      mockDb.resolveNext(state);

      const result = await databaseService.getIndexerState();

      expect(result).toEqual(state);
    });

    it('creates default row when none exists', async () => {
      // First call returns null (no existing state), second returns created row
      mockDb.resolveNext(null);
      const created = { id: 1, last_indexed_momentum: BigInt(0), is_running: false };
      mockDb.tables['indexer_state'] = created;

      const result = await databaseService.getIndexerState();

      expect(result).toMatchObject({ id: 1, last_indexed_momentum: BigInt(0) });
    });
  });

  it('updateIndexerState updates by id from getIndexerState', async () => {
    mockDb.resolveNext({ id: 7, last_indexed_momentum: BigInt(0), is_running: false });
    await databaseService.getIndexerState();

    mockDb.resolveNext({ id: 7, is_running: true });
    await databaseService.updateIndexerState({ is_running: true });

    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.update).toHaveBeenCalled();
  });

  describe('getCurrentHeight', () => {
    it('returns last_indexed_momentum from IndexerState when set', async () => {
      mockDb.resolveNext({ id: 1, last_indexed_momentum: BigInt(123), is_running: false });
      expect(await databaseService.getCurrentHeight()).toBe(BigInt(123));
    });

    it('falls back to MAX(momentum.height) when state height is zero', async () => {
      mockDb.resolveNext({ id: 1, last_indexed_momentum: BigInt(0), is_running: false });
      mockDb.resolveNext({ height: BigInt(42) });
      expect(await databaseService.getCurrentHeight()).toBe(BigInt(42));
    });

    it('falls back to BigInt(1) when state height is zero and no momentums exist', async () => {
      mockDb.resolveNext({ id: 1, last_indexed_momentum: BigInt(0), is_running: false });
      mockDb.resolveNext({ height: null });
      expect(await databaseService.getCurrentHeight()).toBe(BigInt(1));
    });
  });

  it('getMomentumByHash delegates correctly', async () => {
    mockDb.resolveNext({ id: 1 });
    await databaseService.getMomentumByHash('h');
    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.first).toHaveBeenCalled();
  });

  it('getMomentumByHeight delegates correctly', async () => {
    mockDb.resolveNext({ id: 1 });
    await databaseService.getMomentumByHeight(BigInt(5));
    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.first).toHaveBeenCalled();
  });

  it('getAccountBlockByHash delegates correctly', async () => {
    mockDb.resolveNext({ id: 1 });
    await databaseService.getAccountBlockByHash('hash');
    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.first).toHaveBeenCalled();
  });

  it('getAccountByAddress delegates correctly', async () => {
    mockDb.resolveNext({ id: 1 });
    await databaseService.getAccountByAddress('z1abc');
    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.first).toHaveBeenCalled();
  });

  it('getTokenByStandard delegates correctly', async () => {
    mockDb.resolveNext({ id: 1 });
    await databaseService.getTokenByStandard('zts1');
    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.first).toHaveBeenCalled();
  });

  it('getPillarByProducerAccount delegates correctly', async () => {
    mockDb.resolveNext({ id: 1 });
    await databaseService.getPillarByProducerAccount(42);
    const builder = mockDb.lastBuilder();
    expect(builder.where).toHaveBeenCalled();
    expect(builder.first).toHaveBeenCalled();
  });

  it('getStats merges Promise.all counts', async () => {
    // Queue 5 count results — order depends on Promise.all implementation
    mockDb.resolveNext({ count: '1' });
    mockDb.resolveNext({ count: '2' });
    mockDb.resolveNext({ count: '3' });
    mockDb.resolveNext({ count: '4' });
    mockDb.resolveNext({ count: '5' });

    const stats = await databaseService.getStats();

    expect(stats.momentums + stats.accountBlocks + stats.accounts + stats.tokens + stats.pillars).toBe(15);
  });

  it('transaction invokes db.transaction', async () => {
    const fn = vi.fn(async () => 'result');
    const result = await databaseService.transaction(fn);
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(fn).toHaveBeenCalled();
    expect(result).toBe('result');
  });

  it('disconnect calls db.destroy', async () => {
    await databaseService.disconnect();
    expect(mockDb.destroy).toHaveBeenCalledTimes(1);
  });
});
