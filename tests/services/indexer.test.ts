import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const cacheClient = {
  get: vi.fn(),
  getdel: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  expire: vi.fn(),
};

const zenonClient = {
  initialize: vi.fn(),
  getFrontierMomentum: vi.fn(),
  getMomentumsByHeight: vi.fn(),
  getAccountBlockByHash: vi.fn(),
  subscribeToMomentums: vi.fn(),
  unsubscribeFromMomentums: vi.fn(),
  failover: vi.fn(),
  failback: vi.fn(),
  isOnBackup: vi.fn(),
  activeUrl: vi.fn(),
};

const mockDb: any = vi.fn();
mockDb.transaction = vi.fn(async (fn: any) => fn(mockDb));

const insertMomentum = vi.fn();
const insertAccountBlock = vi.fn();

const pluginRegistry = {
  load: vi.fn(),
  catchUp: vi.fn(),
  dispatchMomentum: vi.fn(),
  shutdown: vi.fn(),
};

const zenonConfig = {
  chainId: 1,
  wsUrls: ['ws://localhost'],
  batchSize: 100,
  debug: false,
  exitAfterSync: false,
  stallExitSeconds: 300,
};

const databaseService = {
  getIndexerState: vi.fn(),
  updateIndexerState: vi.fn(),
  setLastIndexedMomentum: vi.fn(),
  getCurrentHeight: vi.fn(),
  getMomentumHash: vi.fn(),
  getStats: vi.fn(),
  getDb: () => mockDb,
};

const cacheService = {
  getClient: () => cacheClient,
};

const contractRegistry = {
  load: vi.fn(),
};

const tokenRegistry = {
  getOrLoad: vi.fn(),
};

const refreshPillarRanks = vi.fn();

const getCurrentChain = vi.fn();

vi.mock('../../src/services/zenon-client.js', () => ({ zenonClient }));
vi.mock('../../src/services/database.js', () => ({ databaseService }));
vi.mock('../../src/services/cache.js', () => ({ cacheService }));
vi.mock('../../src/services/registries/index.js', () => ({
  contractRegistry,
  pillarRegistry: { load: vi.fn() },
  accountRegistry: { size: () => 0 },
  tokenRegistry,
}));
vi.mock('../../src/services/plugin-registry.js', () => ({ pluginRegistry }));
vi.mock('../../src/webhooks/index.js', () => ({ webhookDispatcher: { dispatch: vi.fn() } }));
vi.mock('../../src/actions/indexer/index.js', () => ({ insertMomentum, insertAccountBlock }));
vi.mock('../../src/helpers/chain.js', () => ({ getCurrentChain }));
vi.mock('../../src/config/zenon.js', () => ({ zenonConfig }));

const syncContractMethods = vi.fn();
const seedState = vi.fn();
vi.mock('../../src/database/contract-methods.js', () => ({ syncContractMethods }));
vi.mock('../../src/database/seeders/seed-state.js', () => ({ seedState }));
vi.mock('../../src/actions/indexer/pillar-metrics.js', () => ({ refreshPillarRanks }));

let indexerService: typeof import('../../src/services/indexer.js').indexerService;

beforeEach(async () => {
  vi.resetModules();
  Object.values(cacheClient).forEach((m: any) => m.mockReset());
  Object.values(zenonClient).forEach((m: any) => m.mockReset());
  Object.values(databaseService).forEach((m: any) => m.mockReset?.());
  contractRegistry.load.mockReset();
  syncContractMethods.mockReset();
  syncContractMethods.mockResolvedValue(0);
  seedState.mockReset();
  seedState.mockResolvedValue('seeded');
  tokenRegistry.getOrLoad.mockReset();
  refreshPillarRanks.mockReset();
  getCurrentChain.mockReset();
  insertMomentum.mockReset();
  insertMomentum.mockImplementation(async (_tx: any, m: any) => ({ height: BigInt(m.height) }));
  insertAccountBlock.mockReset();
  mockDb.transaction.mockClear();
  Object.values(pluginRegistry).forEach((m) => m.mockReset());
  zenonConfig.exitAfterSync = false;
  ({ indexerService } = await import('../../src/services/indexer.js'));
});

describe('indexerService', () => {
  it('start() fails without touching the lock when another instance holds it', async () => {
    zenonClient.initialize.mockResolvedValue(undefined);
    getCurrentChain.mockResolvedValue({ id: 1 });
    cacheClient.get.mockResolvedValue(null);
    cacheClient.set.mockResolvedValue(null); // SET NX returned nil → already held

    await expect(indexerService.start()).rejects.toThrow('Could not obtain indexer lock');

    expect(indexerService.isIndexerRunning()).toBe(false);
    expect(cacheClient.set).toHaveBeenCalledWith('lock', '1', 'EX', 30, 'NX');
    expect(cacheClient.del).not.toHaveBeenCalledWith('lock');
  });

  it('pause() sets emergency lock', async () => {
    cacheClient.set.mockResolvedValue('OK');
    await indexerService.pause();
    expect(cacheClient.set).toHaveBeenCalledWith('emergency_lock', '1');
  });

  it('resume() deletes only the emergency lock', async () => {
    cacheClient.del.mockResolvedValue(1);
    await indexerService.resume();
    expect(cacheClient.del).toHaveBeenCalledTimes(1);
    expect(cacheClient.del).toHaveBeenCalledWith('emergency_lock');
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

    zenonClient.activeUrl.mockReturnValue('ws://node');

    const status = await indexerService.getStatus();

    expect(status).toEqual({
      isRunning: false,
      state: 'starting',
      currentHeight: BigInt(0),
      targetHeight: null,
      lastProgressAt: null,
      lastError: null,
      node: 'ws://node',
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

function momentum(height: number, content: Array<{ hash: string }> = []) {
  return { height, hash: { toString: () => `m${height}` }, timestamp: 0, content };
}

/** Serve getMomentumsByHeight from a chain whose frontier is `frontier`. */
function serveChain(frontier: () => number) {
  zenonClient.getMomentumsByHeight.mockImplementation(async (start: number, count: number) => {
    const list = [];
    for (let h = start; h < start + count && h <= frontier(); h++) list.push(momentum(h));
    return { list };
  });
}

function indexedHeights(): number[] {
  return insertMomentum.mock.calls.map((call) => Number(call[1].height));
}

describe('real-time sync', () => {
  let notify: (m: any) => void;
  let service: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    zenonClient.subscribeToMomentums.mockImplementation(async (cb: any) => {
      notify = cb;
      return 'sub-1';
    });
    service = indexerService as any;
    service.isRunning = true;
    service.currentDbHeight = 10n;
  });

  afterEach(async () => {
    service.isRunning = false;
    clearInterval(service.frontierPollTimer);
    clearInterval(service.stallTimer);
    service.wakeWorker?.();
    service.cancelRetryWait?.();
    await service.realtimeWorker;
    vi.useRealTimers();
  });

  it('fills the gap when notifications for N+1 and N+3 arrive', async () => {
    let frontier = 11;
    serveChain(() => frontier);
    await service.startRealtimeSync(10n);

    notify(momentum(11));
    await vi.advanceTimersByTimeAsync(0);
    frontier = 13;
    notify(momentum(13));
    await vi.advanceTimersByTimeAsync(0);

    expect(indexedHeights()).toEqual([11, 12, 13]);
    expect(service.currentDbHeight).toBe(13n);
  });

  it('retries a failed height with backoff and never skips it', async () => {
    serveChain(() => 12);
    insertMomentum.mockRejectedValueOnce(new Error('db down'));
    await service.startRealtimeSync(10n);

    notify(momentum(12));
    await vi.advanceTimersByTimeAsync(0);
    expect(indexedHeights()).toEqual([11]);
    expect(service.currentDbHeight).toBe(10n);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(indexedHeights()).toEqual([11, 11, 12]);
    expect(service.currentDbHeight).toBe(12n);
  });

  it('doubles the retry delay after each failure', async () => {
    serveChain(() => 11);
    insertMomentum.mockRejectedValueOnce(new Error('1')).mockRejectedValueOnce(new Error('2'));
    await service.startRealtimeSync(10n);

    notify(momentum(11));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(indexedHeights()).toEqual([11, 11]);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(indexedHeights()).toEqual([11, 11]);
    await vi.advanceTimersByTimeAsync(1);
    expect(service.currentDbHeight).toBe(11n);
  });

  it('indexes new heights from the frontier poll with no WebSocket events', async () => {
    serveChain(() => 12);
    zenonClient.getFrontierMomentum.mockResolvedValue(momentum(12));
    await service.startRealtimeSync(10n);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(indexedHeights()).toEqual([11, 12]);
  });

  it('fails over when nothing is indexed for STALL_EXIT_SECONDS', async () => {
    // The node answers polls, but its frontier never moves
    zenonClient.getFrontierMomentum.mockResolvedValue(momentum(10));
    databaseService.getMomentumHash.mockResolvedValue('m10');
    zenonClient.failover.mockResolvedValue(true);
    await service.startRealtimeSync(10n);

    await vi.advanceTimersByTimeAsync(299_000);
    expect(zenonClient.failover).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(zenonClient.failover).toHaveBeenCalledWith({ height: 10n, hash: 'm10' });
    expect(databaseService.getMomentumHash).toHaveBeenCalledWith(10n);
  });

  it('fails over after 3 failed frontier polls in a row', async () => {
    zenonClient.getFrontierMomentum.mockRejectedValue(new Error('socket closed'));
    zenonClient.failover.mockResolvedValue(true);
    await service.startRealtimeSync(10n);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(zenonClient.failover).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(zenonClient.failover).toHaveBeenCalledTimes(1);
  });

  it('fails over after 3 failed batches in a row, then indexes the same height', async () => {
    serveChain(() => 11);
    insertMomentum
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'));
    zenonClient.failover.mockResolvedValue(true);
    await service.startRealtimeSync(10n);

    notify(momentum(11));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(zenonClient.failover).not.toHaveBeenCalled();

    // The third failure fails over at once, with no 4 s backoff
    await vi.advanceTimersByTimeAsync(2_000);
    expect(zenonClient.failover).toHaveBeenCalledTimes(1);
    expect(indexedHeights()).toEqual([11, 11, 11, 11]);
    expect(service.currentDbHeight).toBe(11n);
  });

  it('releases the lock and exits with code 1 when a failover finds no healthy node', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    cacheClient.del.mockResolvedValue(1);
    zenonClient.getFrontierMomentum.mockRejectedValue(new Error('socket closed'));
    zenonClient.failover.mockResolvedValue(false);
    await service.startRealtimeSync(10n);

    await vi.advanceTimersByTimeAsync(90_000);
    expect(cacheClient.del).toHaveBeenCalledWith('lock');
    expect(exit).toHaveBeenCalledWith(1);
    expect(service.isRunning).toBe(false);
    exit.mockRestore();
  });

  it('runs a requested failback between batches', async () => {
    databaseService.getMomentumHash.mockResolvedValue('m10');
    await service.startRealtimeSync(10n);

    service.requestNodeCheck('failback');
    await vi.advanceTimersByTimeAsync(0);
    expect(zenonClient.failback).toHaveBeenCalledWith({ height: 10n, hash: 'm10' });
    expect(zenonClient.failover).not.toHaveBeenCalled();
  });

  it('stop() waits for the in-flight momentum', async () => {
    serveChain(() => 11);
    let finishInsert!: () => void;
    insertMomentum.mockImplementationOnce(
      () => new Promise((resolve) => (finishInsert = () => resolve({ height: 11n }))),
    );
    cacheClient.del.mockResolvedValue(1);
    await service.startRealtimeSync(10n);

    notify(momentum(11));
    await vi.advanceTimersByTimeAsync(0);
    const stopped = indexerService.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.currentDbHeight).toBe(10n);

    finishInsert();
    await stopped;
    expect(service.currentDbHeight).toBe(11n);
  });
});

describe('historical sync', () => {
  let service: any;

  beforeEach(() => {
    vi.useFakeTimers();
    service = indexerService as any;
    service.isRunning = true;
    service.currentDbHeight = 10n;
  });

  afterEach(() => {
    service.isRunning = false;
    vi.useRealTimers();
  });

  it('retries a failed batch with backoff instead of stopping', async () => {
    serveChain(() => 12);
    insertMomentum.mockRejectedValueOnce(new Error('db down'));

    const done = service.indexHistoricalMomentums(12);
    await vi.advanceTimersByTimeAsync(1_000);
    await done;

    expect(indexedHeights()).toEqual([11, 11, 12]);
    expect(service.currentDbHeight).toBe(12n);
    expect(service.isRunning).toBe(true);
  });

  it('fails over after 3 failed batches in a row', async () => {
    serveChain(() => 11);
    zenonClient.getMomentumsByHeight
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'));
    zenonClient.failover.mockResolvedValue(true);

    const done = service.indexHistoricalMomentums(11);
    await vi.advanceTimersByTimeAsync(7_000);
    await done;

    expect(zenonClient.failover).toHaveBeenCalledTimes(1);
    expect(service.currentDbHeight).toBe(11n);
  });
});

describe('failback timer', () => {
  it('requests a failback every 5 minutes only while on a backup', async () => {
    vi.useFakeTimers();
    const service = indexerService as any;
    // Keep the stall check out of this test
    zenonConfig.stallExitSeconds = 10_000;
    try {
      zenonClient.initialize.mockResolvedValue(undefined);
      cacheClient.get.mockResolvedValue(null);
      cacheClient.set.mockResolvedValue('OK');
      databaseService.getCurrentHeight.mockResolvedValue(10n);
      zenonClient.getFrontierMomentum.mockResolvedValue(momentum(11));
      serveChain(() => 11);
      zenonClient.subscribeToMomentums.mockResolvedValue('sub-1');
      zenonClient.failback.mockResolvedValue(undefined);
      zenonClient.isOnBackup.mockReturnValue(false);
      await indexerService.start();

      await vi.advanceTimersByTimeAsync(300_000);
      expect(zenonClient.failback).not.toHaveBeenCalled();

      zenonClient.isOnBackup.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(zenonClient.failback).toHaveBeenCalledTimes(1);
    } finally {
      cacheClient.del.mockResolvedValue(1);
      await indexerService.stop();
      clearInterval(service.failbackTimer);
      zenonConfig.stallExitSeconds = 300;
      vi.useRealTimers();
    }
  });
});

describe('missing account blocks', () => {
  it('does not commit a momentum whose account block cannot be fetched', async () => {
    zenonClient.getMomentumsByHeight.mockResolvedValue({
      list: [momentum(11, [{ hash: 'blockhash' }])],
    });
    zenonClient.getAccountBlockByHash.mockResolvedValue(null);

    await expect((indexerService as any).processBatch(11, 1, 11)).rejects.toThrow(
      /Account block blockhash not found/,
    );
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(insertMomentum).not.toHaveBeenCalled();
  });
});

describe('plugin dispatch order', () => {
  it('dispatches the momentum together with its account-block events', async () => {
    zenonClient.getMomentumsByHeight.mockResolvedValue({
      list: [momentum(11, [{ hash: 'blockhash' }])],
    });
    zenonClient.getAccountBlockByHash.mockResolvedValue({
      hash: 'blockhash',
      address: 'z1from',
      toAddress: 'z1to',
      blockType: 2,
    });
    insertAccountBlock.mockResolvedValue({ hash: 'blockhash' });

    await (indexerService as any).processBatch(11, 1, 11);

    expect(pluginRegistry.dispatchMomentum).toHaveBeenCalledTimes(1);
    expect(pluginRegistry.dispatchMomentum).toHaveBeenCalledWith({ height: 11n }, [
      { hash: 'blockhash' },
    ]);
  });
});

describe('indexed height', () => {
  it('stores each momentum as indexed inside its transaction, before plugin dispatch', async () => {
    serveChain(() => 12);

    await (indexerService as any).processBatch(11, 2, 12);

    expect(databaseService.setLastIndexedMomentum.mock.calls).toEqual([
      [mockDb, 11n],
      [mockDb, 12n],
    ]);
    expect(databaseService.updateIndexerState).not.toHaveBeenCalled();
    const stored = databaseService.setLastIndexedMomentum.mock.invocationCallOrder[0];
    const dispatched = pluginRegistry.dispatchMomentum.mock.invocationCallOrder[0];
    expect(stored).toBeLessThan(dispatched);
  });

  it('refreshes pillar ranks in each momentum transaction', async () => {
    serveChain(() => 12);

    await (indexerService as any).processBatch(11, 2, 12);

    expect(refreshPillarRanks.mock.calls).toEqual([[mockDb], [mockDb]]);
    const ranked = refreshPillarRanks.mock.invocationCallOrder[0];
    const stored = databaseService.setLastIndexedMomentum.mock.invocationCallOrder[0];
    expect(ranked).toBeLessThan(stored);
  });
});

describe('historical sync target', () => {
  it('indexes up to and including the frontier momentum', async () => {
    zenonConfig.exitAfterSync = true;
    cacheClient.get.mockResolvedValue(null);
    cacheClient.set.mockResolvedValue('OK');
    cacheClient.del.mockResolvedValue(1);
    databaseService.getCurrentHeight.mockResolvedValue(10n);
    zenonClient.getFrontierMomentum.mockResolvedValue(momentum(12));
    serveChain(() => 12);

    await indexerService.start();

    expect(indexedHeights()).toEqual([11, 12]);
  });
});

describe('startup without a frontier momentum', () => {
  it('fails start() and releases the lock when the frontier momentum cannot be loaded', async () => {
    cacheClient.get.mockResolvedValue(null);
    cacheClient.set.mockResolvedValue('OK');
    cacheClient.del.mockResolvedValue(1);
    databaseService.getCurrentHeight.mockResolvedValue(10n);
    zenonClient.getFrontierMomentum.mockRejectedValue(new Error('no response within 60s'));

    await expect(indexerService.start()).rejects.toThrow();

    expect(indexerService.isIndexerRunning()).toBe(false);
    expect(cacheClient.del).toHaveBeenCalledWith('lock');
  });
});

describe('contract method sync', () => {
  function failAfterRegistries() {
    cacheClient.get.mockResolvedValue(null);
    cacheClient.set.mockResolvedValue('OK');
    cacheClient.del.mockResolvedValue(1);
    databaseService.getCurrentHeight.mockResolvedValue(10n);
    zenonClient.getFrontierMomentum.mockRejectedValue(new Error('stop after registries'));
  }

  it('adds new contract methods to a seeded database before the registry loads', async () => {
    failAfterRegistries();
    const order: string[] = [];
    syncContractMethods.mockImplementation(async () => {
      order.push('sync');
      return 1;
    });
    contractRegistry.load.mockImplementation(async () => {
      order.push('load');
    });

    await expect(indexerService.start()).rejects.toThrow('Unable to load frontier momentum');

    expect(syncContractMethods).toHaveBeenCalledWith(mockDb);
    expect(order).toEqual(['sync', 'load']);
    expect(tokenRegistry.getOrLoad).toHaveBeenCalledWith(mockDb, 'zts1znnxxxxxxxxxxxxx9z4ulx');
  });

  it('leaves an unseeded database to db:seed', async () => {
    failAfterRegistries();
    seedState.mockResolvedValue('empty');

    await expect(indexerService.start()).rejects.toThrow('Unable to load frontier momentum');

    expect(syncContractMethods).not.toHaveBeenCalled();
    expect(contractRegistry.load).toHaveBeenCalled();
  });
});

describe('pause and restart control', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = indexerService as any;
    cacheClient.del.mockResolvedValue(1);
    cacheClient.set.mockResolvedValue('OK');
    cacheClient.getdel.mockResolvedValue(null);
    databaseService.getIndexerState.mockResolvedValue({ last_indexed_momentum: 0n });
    databaseService.getStats.mockResolvedValue({});
  });

  afterEach(async () => {
    service.isRunning = false;
    clearInterval(service.controlTimer);
    clearInterval(service.frontierPollTimer);
    clearInterval(service.stallTimer);
    clearInterval(service.failbackTimer);
    service.releasePauseWait();
    service.wakeWorker?.();
    service.cancelRetryWait?.();
    await service.realtimeWorker;
    vi.useRealTimers();
  });

  it('start() waits while paused and indexes after the pause clears', async () => {
    zenonConfig.exitAfterSync = true;
    cacheClient.get.mockResolvedValueOnce('1').mockResolvedValue(null);
    databaseService.getCurrentHeight.mockResolvedValue(10n);
    zenonClient.getFrontierMomentum.mockResolvedValue(momentum(11));
    serveChain(() => 11);

    const started = indexerService.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(zenonClient.initialize).not.toHaveBeenCalled();
    expect(cacheClient.set).not.toHaveBeenCalled();
    const paused = await indexerService.getStatus();
    expect(paused.state).toBe('paused');
    expect(paused.currentHeight).toBe(10n);

    await vi.advanceTimersByTimeAsync(2_000);
    await started;

    expect(indexedHeights()).toEqual([11]);
    expect(cacheClient.set).toHaveBeenCalledWith('lock', '1', 'EX', 30, 'NX');
  });

  it('stop() ends a start() that is waiting on a pause', async () => {
    cacheClient.get.mockResolvedValue('1');

    const started = indexerService.start();
    await vi.advanceTimersByTimeAsync(0);
    await indexerService.stop();
    await started;

    expect(zenonClient.initialize).not.toHaveBeenCalled();
    expect(indexerService.isIndexerRunning()).toBe(false);
  });

  describe('while indexing history', () => {
    afterEach(() => {
      zenonConfig.batchSize = 100;
    });

    it('stops new batches while paused and resumes at the next height with no gap', async () => {
      zenonConfig.batchSize = 2;
      service.isRunning = true;
      service.currentDbHeight = 10n;
      cacheClient.get.mockResolvedValue(null);
      zenonClient.getFrontierMomentum.mockResolvedValue(momentum(15));
      serveChain(() => 15);
      // The pause arrives while the first batch commits
      insertMomentum.mockImplementation(async (_db: unknown, m: { height: number }) => {
        if (Number(m.height) === 12) service.paused = true;
      });
      service.startControlPoll();

      const indexing = service.indexHistoricalMomentums(15);
      await vi.advanceTimersByTimeAsync(0);

      expect(indexedHeights()).toEqual([11, 12]);
      expect((await indexerService.getStatus()).state).toBe('paused');

      cacheClient.get.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(2_000);
      await indexing;

      expect(indexedHeights()).toEqual([11, 12, 13, 14, 15]);
      insertMomentum.mockReset();
    });
  });

  describe('while running in real-time', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let notify: (m: any) => void;

    beforeEach(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zenonClient.subscribeToMomentums.mockImplementation(async (cb: any) => {
        notify = cb;
        return 'sub-1';
      });
      zenonClient.getFrontierMomentum.mockResolvedValue(momentum(10));
      zenonClient.failover.mockResolvedValue(true);
      databaseService.getMomentumHash.mockResolvedValue('m10');
      cacheClient.get.mockResolvedValue(null);
      service.isRunning = true;
      service.currentDbHeight = 10n;
      service.startControlPoll();
    });

    it('stops new batches while paused and resumes at the next height with no gap', async () => {
      let frontier = 11;
      serveChain(() => frontier);
      await service.startRealtimeSync(10n);

      notify(momentum(11));
      await vi.advanceTimersByTimeAsync(0);
      expect(indexedHeights()).toEqual([11]);

      cacheClient.get.mockResolvedValue('1');
      await vi.advanceTimersByTimeAsync(2_000);
      frontier = 13;
      notify(momentum(13));
      await vi.advanceTimersByTimeAsync(0);

      expect(indexedHeights()).toEqual([11]);
      expect(service.realtimeTarget).toBe(13n);
      expect((await indexerService.getStatus()).state).toBe('paused');

      cacheClient.get.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(2_000);

      expect(indexedHeights()).toEqual([11, 12, 13]);
    });

    it('does not fail over for a stall that spans the pause', async () => {
      serveChain(() => 10);
      cacheClient.get.mockResolvedValue('1');
      await service.startRealtimeSync(10n);
      await vi.advanceTimersByTimeAsync(2_000);

      await vi.advanceTimersByTimeAsync(600_000);
      expect(zenonClient.failover).not.toHaveBeenCalled();

      // The idle time of the pause is not carried over to the resume
      cacheClient.get.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(zenonClient.failover).not.toHaveBeenCalled();
      expect((await indexerService.getStatus()).state).toBe('realtime');
    });

    it('does not count frontier poll failures while paused', async () => {
      serveChain(() => 10);
      cacheClient.get.mockResolvedValue('1');
      zenonClient.getFrontierMomentum.mockRejectedValue(new Error('socket closed'));
      await service.startRealtimeSync(10n);
      await vi.advanceTimersByTimeAsync(2_000);

      await vi.advanceTimersByTimeAsync(120_000);

      expect(service.nodeFailures).toBe(0);
      expect(zenonClient.failover).not.toHaveBeenCalled();
    });

    it('reports stalled after the watchdog fires and realtime after the next commit', async () => {
      let frontier = 10;
      serveChain(() => frontier);
      await service.startRealtimeSync(10n);

      await vi.advanceTimersByTimeAsync(300_000);
      expect(zenonClient.failover).toHaveBeenCalledTimes(1);
      expect((await indexerService.getStatus()).state).toBe('stalled');

      frontier = 11;
      notify(momentum(11));
      await vi.advanceTimersByTimeAsync(0);
      const status = await indexerService.getStatus();
      expect(status.state).toBe('realtime');
      expect(status.targetHeight).toBe(11n);
      expect(status.lastProgressAt).toEqual(expect.any(String));
    });

    it('keeps the instance lock alive while paused', async () => {
      cacheClient.expire.mockResolvedValue(1);
      cacheClient.get.mockResolvedValue('1');
      service.extendLockPeriodically();
      await vi.advanceTimersByTimeAsync(41_000);

      expect(cacheClient.expire).toHaveBeenCalledWith('lock', 30);
      expect(cacheClient.del).not.toHaveBeenCalledWith('lock');
    });

    it('sends SIGTERM once when the restart key is present and consumes it', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kill = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
      cacheClient.getdel.mockResolvedValueOnce('1').mockResolvedValue(null);

      await vi.advanceTimersByTimeAsync(10_000);

      expect(cacheClient.getdel).toHaveBeenCalledWith('restart');
      expect(kill).toHaveBeenCalledTimes(1);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
      kill.mockRestore();
    });

    it('sends SIGTERM once even when every poll finds the restart key', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kill = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);
      cacheClient.getdel.mockResolvedValue('1');

      await vi.advanceTimersByTimeAsync(2_000);
      await service.pollControl();
      await service.pollControl();

      expect(kill).toHaveBeenCalledTimes(1);
      kill.mockRestore();
    });

    it('records the last error from a failed height', async () => {
      serveChain(() => 11);
      insertMomentum.mockRejectedValueOnce(new Error('db down'));
      await service.startRealtimeSync(10n);

      notify(momentum(11));
      await vi.advanceTimersByTimeAsync(0);

      expect((await indexerService.getStatus()).lastError).toEqual({
        message: 'db down',
        at: expect.any(String),
      });
    });

    it('ends a batch after the momentum in flight once stopping', async () => {
      serveChain(() => 13);
      service.stopping = true;

      const indexed = await service.processBatch(11, 3, 13);

      expect(indexed).toBe(1);
      expect(indexedHeights()).toEqual([11]);
    });
  });
});
