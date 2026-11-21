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

  it('setLastIndexedMomentum updates the state row through the given transaction', async () => {
    const tx = makeMockKnex();
    tx.resolveNext(1);
    await databaseService.setLastIndexedMomentum(tx as any, 42n);

    expect(tx.lastBuilder().update).toHaveBeenCalledWith({
      last_indexed_momentum: 42n,
      updated_at: expect.any(Date),
    });
  });

  describe('getCurrentHeight', () => {
    it('returns last_indexed_momentum from IndexerState as a bigint', async () => {
      // pg returns bigint columns as strings
      mockDb.resolveNext({ id: 1, last_indexed_momentum: '123', is_running: false });
      expect(await databaseService.getCurrentHeight()).toBe(BigInt(123));
    });

    it('falls back to MAX(momentum.height) when state height is zero', async () => {
      mockDb.resolveNext({ id: 1, last_indexed_momentum: BigInt(0), is_running: false });
      // pg returns bigint columns as strings
      mockDb.resolveNext({ height: '42' });
      expect(await databaseService.getCurrentHeight()).toBe(BigInt(42));
      // Without the alias Postgres names the column `max`
      expect(mockDb.lastBuilder().max).toHaveBeenCalledWith('height as height');
    });

    it('falls back to BigInt(0) when state height is zero and no momentums exist', async () => {
      mockDb.resolveNext({ id: 1, last_indexed_momentum: BigInt(0), is_running: false });
      mockDb.resolveNext({ height: null });
      expect(await databaseService.getCurrentHeight()).toBe(BigInt(0));
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

  it('getStats reads row estimates from pg_class without COUNT(*)', async () => {
    mockDb.raw.mockResolvedValueOnce({
      rows: [
        { relname: 'nom_momentums', estimate: '1000' },
        { relname: 'nom_account_blocks', estimate: '5000' },
        { relname: 'nom_accounts', estimate: '300' },
        { relname: 'nom_tokens', estimate: '40' },
      ],
    });

    const stats = await databaseService.getStats();

    expect(stats).toEqual({
      momentums: 1000,
      accountBlocks: 5000,
      accounts: 300,
      tokens: 40,
      pillars: 0,
    });
    const sql = mockDb.raw.mock.calls[0][0] as string;
    expect(sql).toContain('pg_class');
    expect(sql.toLowerCase()).not.toContain('count(');
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
