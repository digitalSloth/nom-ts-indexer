import { describe, it, expect, beforeEach, vi } from 'vitest';

const cacheClient = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
};

const zenonClient = {
  initialize: vi.fn(),
  getFrontierMomentum: vi.fn(),
  subscribeToMomentums: vi.fn(),
  unsubscribeFromMomentums: vi.fn(),
};

const mockDb = vi.fn();

const databaseService = {
  getIndexerState: vi.fn(),
  updateIndexerState: vi.fn(),
  getCurrentHeight: vi.fn(),
  getStats: vi.fn(),
  getDb: () => mockDb,
};

const partitionManager = {
  checkAndPartition: vi.fn(),
};

const cacheService = {
  getClient: () => cacheClient,
};

const contractRegistry = {
  load: vi.fn(),
};

const getCurrentChain = vi.fn();

vi.mock('../../src/services/zenon-client.js', () => ({ zenonClient }));
vi.mock('../../src/services/database.js', () => ({ databaseService }));
vi.mock('../../src/services/partition-manager.js', () => ({ partitionManager }));
vi.mock('../../src/services/cache.js', () => ({ cacheService }));
vi.mock('../../src/services/contract-registry.js', () => ({ contractRegistry }));
vi.mock('../../src/actions/indexer/index.js', () => ({
  insertMomentum: vi.fn(),
  insertAccountBlock: vi.fn(),
}));
vi.mock('../../src/helpers/chain.js', () => ({ getCurrentChain }));
vi.mock('../../src/config/zenon.js', () => ({
  zenonConfig: {
    chainId: 1,
    rpcUrl: 'http://localhost',
    wsUrl: 'ws://localhost',
    batchSize: 100,
    debug: false,
  },
}));

let indexerService: typeof import('../../src/services/indexer.js').indexerService;

beforeEach(async () => {
  vi.resetModules();
  Object.values(cacheClient).forEach((m: any) => m.mockReset());
  Object.values(zenonClient).forEach((m: any) => m.mockReset());
  Object.values(databaseService).forEach((m: any) => m.mockReset?.());
  partitionManager.checkAndPartition.mockReset();
  contractRegistry.load.mockReset();
  getCurrentChain.mockReset();
  ({ indexerService } = await import('../../src/services/indexer.js'));
});

describe('indexerService', () => {
  it('start() returns early when emergency lock is set', async () => {
    zenonClient.initialize.mockResolvedValue(undefined);
    getCurrentChain.mockResolvedValue({ id: 1 });
    cacheClient.get.mockResolvedValue('1'); // emergency lock present

    await indexerService.start();

    expect(indexerService.isIndexerRunning()).toBe(false);
    expect(databaseService.updateIndexerState).not.toHaveBeenCalled();
  });

  it('start() returns early when regular lock not acquired', async () => {
    zenonClient.initialize.mockResolvedValue(undefined);
    getCurrentChain.mockResolvedValue({ id: 1 });
    cacheClient.get.mockResolvedValue(null);
    cacheClient.set.mockResolvedValue(null); // SET NX returned nil → already held

    await indexerService.start();

    expect(indexerService.isIndexerRunning()).toBe(false);
    expect(cacheClient.set).toHaveBeenCalledWith('indexer:lock', '1', 'EX', 30, 'NX');
  });

  it('pause() sets emergency lock', async () => {
    cacheClient.set.mockResolvedValue('OK');
    await indexerService.pause();
    expect(cacheClient.set).toHaveBeenCalledWith('indexer:emergency_lock', '1');
  });

  it('resume() clears both locks', async () => {
    cacheClient.del.mockResolvedValue(2);
    await indexerService.resume();
    expect(cacheClient.del).toHaveBeenCalledWith('indexer:emergency_lock', 'indexer:lock');
  });

  it('stop() is a no-op when not running', async () => {
    await indexerService.stop();
    expect(databaseService.updateIndexerState).not.toHaveBeenCalled();
    expect(cacheClient.del).not.toHaveBeenCalled();
  });

  it('getStatus() merges indexer state and stats', async () => {
    databaseService.getIndexerState.mockResolvedValue({
      id: 1,
      last_indexed_momentum: BigInt(99),
      is_running: false,
    });
    databaseService.getStats.mockResolvedValue({
      momentums: 1,
      accountBlocks: 2,
      accounts: 3,
      tokens: 4,
      pillars: 5,
    });

    const status = await indexerService.getStatus();

    expect(status).toEqual({
      isRunning: false,
      currentHeight: BigInt(0),
      lastIndexedMomentum: BigInt(99),
      stats: {
        momentums: 1,
        accountBlocks: 2,
        accounts: 3,
        tokens: 4,
        pillars: 5,
      },
      cache: {
        accounts: expect.any(Number),
      },
    });
  });

  it('isIndexerRunning() reflects internal flag', () => {
    expect(indexerService.isIndexerRunning()).toBe(false);
  });
});
