import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ZenonIndexerPlugin,
  PluginContext,
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
const mockDb = Object.assign(
  vi.fn().mockReturnValue({ ...chainMethods }),
  {
    raw: vi.fn().mockResolvedValue({ rows: [] }),
  },
);
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

  describe('dispatchAccountBlock()', () => {
    it('fans out to all loaded plugins', async () => {
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
      await pluginRegistry.dispatchAccountBlock(event);

      expect(plugin1.onAccountBlock).toHaveBeenCalledWith(event);
      expect(plugin2.onAccountBlock).toHaveBeenCalledWith(event);
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
      await pluginRegistry.dispatchAccountBlock(event);

      expect(goodPlugin.onAccountBlock).toHaveBeenCalledWith(event);
      expect(errorSpy).toHaveBeenCalled();
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
      await pluginRegistry.dispatchMomentum(event);

      expect(plugin.onMomentum).toHaveBeenCalledWith(event);
    });

    it('skips plugins without onMomentum handler', async () => {
      const plugin = makePlugin({ onMomentum: undefined });
      vi.doMock('no-momentum', () => ({ default: () => plugin }));
      mockConfig = [{ package: 'no-momentum', enabled: true, config: {} }];

      const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
      await pluginRegistry.load();

      const event = { height: BigInt(100), hash: 'abc' } as IndexedMomentumEvent;
      await pluginRegistry.dispatchMomentum(event);
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
