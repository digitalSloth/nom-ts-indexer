import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ZenonIndexerPlugin,
  IndexedAccountBlockEvent,
  IndexedMomentumEvent,
} from '../../src/plugins/types.js';

// Mock pluginsConfig — controls which plugins are loaded
let mockConfig: Array<{ package: string; enabled: boolean; config: Record<string, unknown> }> = [];
vi.mock('../../src/config/plugins.js', () => ({
  get pluginsConfig() {
    return mockConfig;
  },
  isLocalPlugin: (entry: { package: string }) =>
    entry.package.startsWith('.') || entry.package.startsWith('/'),
}));

// Mock knex for plugin migrations
const mockMigrateLatest = vi.fn().mockResolvedValue(undefined);
const mockMigratorDestroy = vi.fn().mockResolvedValue(undefined);
vi.mock('knex', () => ({
  default: vi.fn(() => ({
    migrate: { latest: mockMigrateLatest },
    destroy: mockMigratorDestroy,
  })),
}));

// Mock db for PluginDb and watermark queries
const chainMethods = {
  select: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  first: vi.fn().mockResolvedValue(undefined),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  onConflict: vi.fn().mockReturnThis(),
  ignore: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
};
// A transaction runs its callback on the same mock
const mockDb: any = Object.assign(vi.fn().mockReturnValue({ ...chainMethods }), {
  raw: vi.fn().mockResolvedValue({ rows: [] }),
});
mockDb.transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockDb));
vi.mock('../../src/database/knex.js', () => ({
  db: mockDb,
}));
vi.mock('../../src/services/database.js', () => ({
  databaseService: {
    getDb: () => mockDb,
  },
}));

// Helper to create a mock plugin
function makePlugin(overrides: Partial<ZenonIndexerPlugin> = {}): ZenonIndexerPlugin {
  return {
    name: 'test-plugin',
    init: vi.fn().mockResolvedValue(undefined),
    onAccountBlock: vi.fn().mockResolvedValue(undefined),
    onMomentum: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  beforeEach(() => {
    vi.resetModules();
    mockConfig = [];
    vi.clearAllMocks();
    // Restore default mock return value (clearAllMocks doesn't reset mockReturnValue)
    mockDb.mockReturnValue({ ...chainMethods });
  });

  describe('load()', () => {
    it('does nothing with empty config', async () => {
      mockConfig = [];
      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
    });

    it('loads a plugin and calls init with context', async () => {
      const plugin = makePlugin();
      vi.doMock('test-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'test-plugin', enabled: true, config: { key: 'value' } }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      expect(plugin.init).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { key: 'value' },
          db: expect.objectContaining({
            execute: expect.any(Function),
            query: expect.any(Function),
          }),
          log: expect.objectContaining({
            info: expect.any(Function),
            warn: expect.any(Function),
            error: expect.any(Function),
          }),
          databaseUrl: expect.any(String),
          genesisPath: expect.any(String),
        }),
      );
    });

    it('skips plugin when init throws', async () => {
      const plugin = makePlugin({ init: vi.fn().mockRejectedValue(new Error('init failed')) });
      vi.doMock('failing-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'failing-plugin', enabled: true, config: {} }];

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load plugin'),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    it('skips plugin when default export is not a function', async () => {
      vi.doMock('bad-plugin', () => ({ default: 'not a function' }));
      mockConfig = [{ package: 'bad-plugin', enabled: true, config: {} }];

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a function'));
      warnSpy.mockRestore();
    });
  });

  describe('catchUp()', () => {
    it('replays blocks above watermark in order', async () => {
      const plugin = makePlugin({ name: 'catchup-plugin' });
      vi.doMock('catchup-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'catchup-plugin', enabled: true, config: {} }];

      // Mock watermark read — return 10 for the select().where().first() chain
      const mockFirst = vi.fn().mockResolvedValue({ watermark: '10' });
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst });
      const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.mockReturnValue({
        select: mockSelect,
        where: mockWhere,
        first: mockFirst,
        insert: vi.fn().mockReturnThis(),
        onConflict: vi.fn().mockReturnThis(),
        ignore: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      });

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      await pluginRegistry.catchUp(BigInt(12));

      // iterateAccountBlocks was called — verify the query chain was hit
      expect(mockDb).toHaveBeenCalled();
    });

    it('skips catch-up when watermark is current', async () => {
      const plugin = makePlugin({ name: 'up-to-date-plugin' });
      vi.doMock('up-to-date-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'up-to-date-plugin', enabled: true, config: {} }];

      // Mock watermark read — return 100
      const mockFirst = vi.fn().mockResolvedValue({ watermark: '100' });
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst });
      const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.mockReturnValue({
        select: mockSelect,
        where: mockWhere,
        first: mockFirst,
        insert: vi.fn().mockReturnThis(),
        onConflict: vi.fn().mockReturnThis(),
        ignore: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      });

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.catchUp(BigInt(100));

      // No query chain needed — catch-up was skipped
    });

    it('isolates failures — one plugin failing does not block others', async () => {
      const goodPlugin = makePlugin({ name: 'good' });
      const badPlugin = makePlugin({ name: 'bad' });
      vi.doMock('good-plugin', () => ({ default: () => goodPlugin }));
      vi.doMock('bad-plugin', () => ({ default: () => badPlugin }));
      mockConfig = [
        { package: 'good-plugin', enabled: true, config: {} },
        { package: 'bad-plugin', enabled: true, config: {} },
      ];

      // Mock: first call returns watermark 0, second call throws
      let callCount = 0;
      const mockFirst = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('watermark error');
        return { watermark: '0' };
      });
      const mockWhere = vi.fn().mockReturnValue({ first: mockFirst });
      const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.mockReturnValue({
        select: mockSelect,
        where: mockWhere,
        first: mockFirst,
        insert: vi.fn().mockReturnThis(),
        onConflict: vi.fn().mockReturnThis(),
        ignore: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      await pluginRegistry.catchUp(BigInt(10));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('catchUp failed'),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });
  });

  describe('catchUp() block selection', () => {
    function row(id: number, accountHeight: number, momentumHeight: number) {
      return {
        id,
        hash: `block${id}`,
        block_type: 2,
        height: accountHeight,
        amount: '0',
        account_address: 'z1from',
        to_account_address: 'z1to',
        token_standard: null,
        momentum_id: momentumHeight,
        momentum_height: momentumHeight,
        momentum_hash: `m${momentumHeight}`,
        momentum_created_at: new Date(0),
        data_raw: null,
        data_decoded: null,
        contract_method_name: null,
        contract_name: null,
        paired_hash: null,
      };
    }

    /** Serve block windows from `fixture` and the plugin state from `watermark`. */
    function serveChain(fixture: any[], watermark: string) {
      const blockQuery: any = {
        range: null as null | { column: string; from: number; to: number },
        leftJoin() {
          return this;
        },
        select() {
          return this;
        },
        orderBy() {
          return this;
        },
        whereBetween(column: string, [from, to]: [string, string]) {
          this.range = { column, from: Number(from), to: Number(to) };
          return this;
        },
        then(resolve: any) {
          const { column, from, to } = this.range;
          const key = column === 'mom.height' ? 'momentum_height' : 'height';
          return Promise.resolve(fixture.filter((r: any) => r[key] >= from && r[key] <= to)).then(
            resolve,
          );
        },
      };
      const update = vi.fn().mockResolvedValue(undefined);
      const stateQuery = {
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ watermark }),
        insert: vi.fn().mockReturnThis(),
        onConflict: vi.fn().mockReturnThis(),
        ignore: vi.fn().mockResolvedValue(undefined),
        update,
      };
      mockDb.mockImplementation((table: string) =>
        table === 'nom_account_blocks as ab' ? { ...blockQuery } : stateQuery,
      );
      return { update };
    }

    it('selects blocks by momentum height, not account-chain height', async () => {
      const { update } = serveChain([row(1, 50, 11), row(2, 1, 12), row(3, 11, 500)], '10');
      const plugin = makePlugin({ name: 'window-plugin' });
      vi.doMock('window-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'window-plugin', enabled: true, config: {} }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.catchUp(BigInt(12));

      const hashes = (plugin.onAccountBlock as any).mock.calls.map((c: any[]) => c[0].hash);
      expect(hashes).toEqual(['block1', 'block2']);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ watermark: '12' }));
    });

    it('delivers block and momentum heights as bigint, as live dispatch does', async () => {
      // pg returns bigint columns as strings
      const fixture = [{ ...row(1, 50, 11), height: '50', momentum_height: '11' }];
      serveChain(fixture, '10');
      const plugin = makePlugin({ name: 'window-plugin' });
      vi.doMock('window-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'window-plugin', enabled: true, config: {} }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.catchUp(BigInt(11));

      const event = (plugin.onAccountBlock as any).mock.calls[0][0];
      expect(event.height).toBe(50n);
      expect(event.momentum.height).toBe(11n);
    });

    it('saves the watermark after each window', async () => {
      const { update } = serveChain([row(1, 1, 500), row(2, 1, 1500), row(3, 1, 2200)], '0');
      const plugin = makePlugin({ name: 'window-plugin' });
      vi.doMock('window-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'window-plugin', enabled: true, config: {} }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.catchUp(BigInt(2500));

      const watermarks = update.mock.calls.map((c: any[]) => c[0].watermark);
      expect(watermarks).toEqual(['1000', '2000', '2500']);
    });

    it('keeps the last finished window and disables the plugin when replay fails', async () => {
      const { update } = serveChain([row(1, 1, 500), row(2, 1, 1500), row(3, 1, 2200)], '0');
      const plugin = makePlugin({
        name: 'failing-plugin',
        onAccountBlock: vi.fn(async (event: IndexedAccountBlockEvent) => {
          if (event.hash === 'block2') throw new Error('boom');
        }),
      });
      vi.doMock('failing-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'failing-plugin', enabled: true, config: {} }];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.catchUp(BigInt(2500));

      expect(update.mock.calls.map((c: any[]) => c[0].watermark)).toEqual(['1000']);
      expect(plugin.shutdown).toHaveBeenCalled();

      // Live dispatch no longer reaches the plugin or moves its watermark
      await pluginRegistry.dispatchMomentum(
        { height: BigInt(2501), hash: 'm2501' } as IndexedMomentumEvent,
        [{ hash: 'block4' } as IndexedAccountBlockEvent],
      );
      expect(plugin.onAccountBlock).toHaveBeenCalledTimes(2);
      expect(plugin.onMomentum).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  describe('dispatchMomentum() account blocks', () => {
    it('fans out to all loaded plugins, each with its own transaction', async () => {
      const plugin1 = makePlugin({ name: 'p1' });
      const plugin2 = makePlugin({ name: 'p2' });
      vi.doMock('p1', () => ({ default: () => plugin1 }));
      vi.doMock('p2', () => ({ default: () => plugin2 }));
      mockConfig = [
        { package: 'p1', enabled: true, config: {} },
        { package: 'p2', enabled: true, config: {} },
      ];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      const event = { hash: 'abc', height: BigInt(5) } as IndexedAccountBlockEvent;
      await pluginRegistry.dispatchMomentum({ height: BigInt(5) } as IndexedMomentumEvent, [event]);

      expect(plugin1.onAccountBlock).toHaveBeenCalledWith(event, mockDb);
      expect(plugin2.onAccountBlock).toHaveBeenCalledWith(event, mockDb);
      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
    });

    it('isolates failures from individual plugins', async () => {
      const goodPlugin = makePlugin({ name: 'good' });
      const badPlugin = makePlugin({
        name: 'bad',
        onAccountBlock: vi.fn().mockRejectedValue(new Error('dispatch error')),
      });
      vi.doMock('good', () => ({ default: () => goodPlugin }));
      vi.doMock('bad', () => ({ default: () => badPlugin }));
      mockConfig = [
        { package: 'good', enabled: true, config: {} },
        { package: 'bad', enabled: true, config: {} },
      ];

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      const event = { hash: 'abc', height: BigInt(5) } as IndexedAccountBlockEvent;
      await pluginRegistry.dispatchMomentum({ height: BigInt(5) } as IndexedMomentumEvent, [event]);

      expect(goodPlugin.onAccountBlock).toHaveBeenCalledWith(event, mockDb);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('dispatchMomentum() halting', () => {
    it('halts a plugin whose onAccountBlock throws and keeps its watermark', async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      mockDb.mockReturnValue({ ...chainMethods, update });
      const bad = makePlugin({
        name: 'bad',
        onAccountBlock: vi.fn().mockRejectedValue(new Error('boom')),
      });
      const good = makePlugin({ name: 'good' });
      vi.doMock('bad', () => ({ default: () => bad }));
      vi.doMock('good', () => ({ default: () => good }));
      mockConfig = [
        { package: 'bad', enabled: true, config: {} },
        { package: 'good', enabled: true, config: {} },
      ];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      await pluginRegistry.dispatchMomentum(
        { height: BigInt(7), hash: 'm7' } as IndexedMomentumEvent,
        [{ hash: 'b1' } as IndexedAccountBlockEvent, { hash: 'b2' } as IndexedAccountBlockEvent],
      );
      await pluginRegistry.dispatchMomentum(
        { height: BigInt(8), hash: 'm8' } as IndexedMomentumEvent,
        [{ hash: 'b3' } as IndexedAccountBlockEvent],
      );

      expect(bad.onAccountBlock).toHaveBeenCalledTimes(1);
      expect(bad.shutdown).toHaveBeenCalledTimes(1);
      expect(bad.onMomentum).not.toHaveBeenCalled();
      expect(good.onAccountBlock).toHaveBeenCalledTimes(3);
      expect(good.shutdown).not.toHaveBeenCalled();
      expect(good.onMomentum).toHaveBeenCalledTimes(2);
      expect(update.mock.calls.map((c: any[]) => c[0].watermark)).toEqual(['7', '8']);
      errorSpy.mockRestore();
    });

    it('still shuts down and drops a halted plugin when its shutdown throws', async () => {
      const bad = makePlugin({
        name: 'bad',
        onAccountBlock: vi.fn().mockRejectedValue(new Error('boom')),
        shutdown: vi.fn().mockRejectedValue(new Error('shutdown boom')),
      });
      vi.doMock('bad', () => ({ default: () => bad }));
      mockConfig = [{ package: 'bad', enabled: true, config: {} }];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      const momentum = { height: BigInt(7), hash: 'm7' } as IndexedMomentumEvent;
      await pluginRegistry.dispatchMomentum(momentum, [{ hash: 'b1' } as IndexedAccountBlockEvent]);
      await pluginRegistry.dispatchMomentum(momentum, [{ hash: 'b2' } as IndexedAccountBlockEvent]);

      expect(bad.onAccountBlock).toHaveBeenCalledTimes(1);
      expect(bad.shutdown).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  describe('dispatchMomentum()', () => {
    it('fans out to plugins with onMomentum handler', async () => {
      const plugin = makePlugin();
      vi.doMock('momentum-plugin', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'momentum-plugin', enabled: true, config: {} }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      const event = { height: BigInt(100), hash: 'abc' } as IndexedMomentumEvent;
      await pluginRegistry.dispatchMomentum(event, []);

      expect(plugin.onMomentum).toHaveBeenCalledWith(event, mockDb);
    });

    it('writes the watermark for a plugin without onMomentum', async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      mockDb.mockReturnValue({ ...chainMethods, update });
      const plugin = makePlugin({ onMomentum: undefined });
      vi.doMock('no-momentum', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'no-momentum', enabled: true, config: {} }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      const event = { height: BigInt(100), hash: 'abc' } as IndexedMomentumEvent;
      await pluginRegistry.dispatchMomentum(event, []);

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ watermark: '100' }));
    });

    it('halts the plugin and keeps its watermark when onMomentum throws', async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      mockDb.mockReturnValue({ ...chainMethods, update });
      const plugin = makePlugin({ onMomentum: vi.fn().mockRejectedValue(new Error('boom')) });
      vi.doMock('failing-momentum', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'failing-momentum', enabled: true, config: {} }];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.dispatchMomentum(
        { height: BigInt(100), hash: 'abc' } as IndexedMomentumEvent,
        [],
      );

      expect(update).not.toHaveBeenCalled();
      expect(plugin.shutdown).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });

  describe('shutdown()', () => {
    it('calls shutdown on all plugins', async () => {
      const plugin1 = makePlugin({ name: 'p1' });
      const plugin2 = makePlugin({ name: 'p2' });
      vi.doMock('p1', () => ({ default: () => plugin1 }));
      vi.doMock('p2', () => ({ default: () => plugin2 }));
      mockConfig = [
        { package: 'p1', enabled: true, config: {} },
        { package: 'p2', enabled: true, config: {} },
      ];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.shutdown();

      expect(plugin1.shutdown).toHaveBeenCalled();
      expect(plugin2.shutdown).toHaveBeenCalled();
    });

    it('isolates shutdown failures', async () => {
      const goodPlugin = makePlugin({ name: 'good' });
      const badPlugin = makePlugin({
        name: 'bad',
        shutdown: vi.fn().mockRejectedValue(new Error('shutdown error')),
      });
      vi.doMock('good', () => ({ default: () => goodPlugin }));
      vi.doMock('bad', () => ({ default: () => badPlugin }));
      mockConfig = [
        { package: 'good', enabled: true, config: {} },
        { package: 'bad', enabled: true, config: {} },
      ];

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();
      await pluginRegistry.shutdown();

      expect(goodPlugin.shutdown).toHaveBeenCalled();
      expect(badPlugin.shutdown).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
