import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';

let mockDb: MockKnex;

vi.mock('../../../src/services/database.js', () => ({
  databaseService: {
    getDb: () => mockDb,
  },
}));

const { pillarRegistry } = await import('../../../src/services/registries/pillar-registry.js');

describe('PillarRegistry', () => {
  beforeEach(() => {
    mockDb = makeMockKnex();
  });

  it('loads live and historical pillar mappings', async () => {
    mockDb.resolveNext([
      { id: 1, producer_account_id: 10 },
      { id: 2, producer_account_id: 20 },
    ]);
    mockDb.resolveNext([
      { pillar_id: 1, producer_account_id: 30 },
      { pillar_id: 2, producer_account_id: 20 },
    ]);

    await pillarRegistry.load();

    expect(pillarRegistry.isLoaded()).toBe(true);
    expect(pillarRegistry.getPillarId(10)).toBe(1);
    expect(pillarRegistry.getPillarId(20)).toBe(2);
    expect(pillarRegistry.getPillarId(30)).toBe(1);
    expect(pillarRegistry.getPillarId(999)).toBeNull();
  });

  it('history does not overwrite live mappings', async () => {
    mockDb.resolveNext([
      { id: 1, producer_account_id: 10 },
    ]);
    mockDb.resolveNext([
      { pillar_id: 99, producer_account_id: 10 },
    ]);

    await pillarRegistry.load();

    expect(pillarRegistry.getPillarId(10)).toBe(1);
  });

  it('setPillarId updates the in-memory map', async () => {
    mockDb.resolveNext([]);
    mockDb.resolveNext([]);
    await pillarRegistry.load();

    pillarRegistry.setPillarId(50, 5);
    expect(pillarRegistry.getPillarId(50)).toBe(5);
  });

  it('clear resets state', async () => {
    mockDb.resolveNext([{ id: 1, producer_account_id: 10 }]);
    mockDb.resolveNext([]);
    await pillarRegistry.load();

    pillarRegistry.clear();

    expect(pillarRegistry.isLoaded()).toBe(false);
    expect(pillarRegistry.getPillarId(10)).toBeNull();
  });
});
