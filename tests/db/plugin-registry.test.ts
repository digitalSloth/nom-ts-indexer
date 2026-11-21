import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
import { createScratchDatabase, dropScratchDatabase } from './scratch.js';
import type {
  IndexedAccountBlockEvent,
  IndexedMomentumEvent,
  ZenonIndexerPlugin,
} from '../../src/plugins/types.js';

const SCRATCH = 'plugin_registry_test';
const ADDRESS = 'z1qqcam4ycu0ta8333hx38r5j2z3ry9jjfxkc7t5';

const dbRef: { current?: Knex } = {};

vi.mock('../../src/services/database.js', () => ({
  databaseService: { getDb: () => dbRef.current },
}));
vi.mock('../../src/config/plugins.js', () => ({
  pluginsConfig: [{ package: 'probe-under-test', enabled: true, config: {} }],
  isLocalPlugin: () => false,
}));

/** The plugin rows a reader outside the registry's transaction sees above the watermark. */
async function rowsAboveWatermark(db: Knex): Promise<number> {
  const result = await db.raw(
    `select count(*)::int as n from probe_rows
     where momentum_height > (select watermark from indexer_plugin_state where name = 'probe')`,
  );
  return result.rows[0].n;
}

/**
 * A plugin that writes one row per block through the registry's
 * transaction. After each write it asks a reader on another connection
 * what it sees, and it throws once it has written the block `crashAt`.
 */
function probe(db: Knex, crashAt: string | null) {
  const seen: number[] = [];
  const plugin: ZenonIndexerPlugin = {
    name: 'probe',
    async init() {},
    async onAccountBlock(event: IndexedAccountBlockEvent, tx: Knex.Transaction) {
      await tx('probe_rows').insert({
        block_hash: event.hash,
        momentum_height: event.momentum.height.toString(),
      });
      seen.push(await rowsAboveWatermark(db));
      if (event.hash === crashAt) throw new Error('crash before the watermark');
    },
    async shutdown() {},
  };
  return { plugin, seen };
}

async function loadProbe(crashAt: string | null) {
  const db = dbRef.current as Knex;
  const { plugin, seen } = probe(db, crashAt);
  vi.resetModules();
  vi.doMock('probe-under-test', () => ({ default: () => plugin }));
  const { pluginRegistry } = await import('../../src/services/plugin-registry.js');
  await pluginRegistry.load();
  return { pluginRegistry, seen };
}

/** Write one momentum per height, each with the given number of blocks, and return their events. */
async function seedChain(
  db: Knex,
  heights: number[],
  blocksPerMomentum: number,
): Promise<{ momentum: IndexedMomentumEvent; blocks: IndexedAccountBlockEvent[] }[]> {
  const [account] = await db('nom_accounts').insert({ address: ADDRESS }).returning('id');
  const chain = [];
  for (const height of heights) {
    const createdAt = new Date(height * 1000);
    const [momentum] = await db('nom_momentums')
      .insert({
        height,
        hash: `m${height}`,
        producer_account_id: account.id,
        created_at: createdAt,
      })
      .returning('id');
    const event: IndexedMomentumEvent = {
      momentumId: momentum.id,
      height: BigInt(height),
      hash: `m${height}`,
      timestamp: height,
    };
    const blocks: IndexedAccountBlockEvent[] = [];
    for (let i = 0; i < blocksPerMomentum; i++) {
      const hash = `b${height}-${i}`;
      const [block] = await db('nom_account_blocks')
        .insert({
          block_type: 2,
          height: height * 10 + i,
          account_id: account.id,
          to_account_id: account.id,
          momentum_id: momentum.id,
          hash,
          created_at: createdAt,
        })
        .returning('id');
      blocks.push({ accountBlockId: block.id, hash, momentum: event } as IndexedAccountBlockEvent);
    }
    chain.push({ momentum: event, blocks });
  }
  return chain;
}

async function watermark(db: Knex): Promise<string> {
  const row = await db('indexer_plugin_state').where({ name: 'probe' }).first();
  return row.watermark;
}

/** The momentum heights that have plugin rows, ascending. */
async function storedHeights(db: Knex): Promise<string[]> {
  return db('probe_rows')
    .distinct('momentum_height')
    .orderBy('momentum_height')
    .pluck('momentum_height');
}

const db = () => dbRef.current as Knex;

beforeAll(async () => {
  dbRef.current = await createScratchDatabase(SCRATCH);
  await db().schema.createTable('probe_rows', (t) => {
    t.string('block_hash').primary();
    t.bigInteger('momentum_height').notNullable();
  });
});

afterAll(async () => {
  await dropScratchDatabase(dbRef.current, SCRATCH);
});

beforeEach(async () => {
  await db().raw(
    'TRUNCATE probe_rows, indexer_plugin_state, nom_account_blocks, nom_momentums, nom_accounts RESTART IDENTITY CASCADE',
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('live dispatch', () => {
  it('never shows a reader a plugin row above the watermark', async () => {
    const chain = await seedChain(db(), [1, 2], 2);
    const { pluginRegistry, seen } = await loadProbe(null);

    for (const { momentum, blocks } of chain) {
      await pluginRegistry.dispatchMomentum(momentum, blocks);
    }

    expect(seen).toEqual([0, 0, 0, 0]);
    expect(await watermark(db())).toBe('2');
    expect(await storedHeights(db())).toEqual(['1', '2']);
  });

  it('rolls back the rows of a momentum that crashes before its watermark', async () => {
    const chain = await seedChain(db(), [1, 2, 3], 2);
    const { pluginRegistry, seen } = await loadProbe('b2-0');

    for (const { momentum, blocks } of chain) {
      await pluginRegistry.dispatchMomentum(momentum, blocks);
    }

    // The crash halts the plugin, so momentum 3 is not delivered either
    expect(seen).toEqual([0, 0, 0]);
    expect(await watermark(db())).toBe('1');
    expect(await storedHeights(db())).toEqual(['1']);
    expect(await rowsAboveWatermark(db())).toBe(0);
  });
});

describe('catch-up', () => {
  it('never shows a reader a plugin row above the watermark', async () => {
    await seedChain(db(), [1, 999, 1000, 1001, 1500], 1);
    const { pluginRegistry, seen } = await loadProbe(null);

    await pluginRegistry.catchUp(1500n);

    expect(seen).toEqual([0, 0, 0, 0, 0]);
    expect(await watermark(db())).toBe('1500');
    expect(await storedHeights(db())).toEqual(['1', '999', '1000', '1001', '1500']);
  });

  it('rolls back the window that crashes before its watermark', async () => {
    await seedChain(db(), [1, 999, 1000, 1001, 1500], 1);
    const { pluginRegistry, seen } = await loadProbe('b1001-0');

    await pluginRegistry.catchUp(1500n);

    expect(seen).toEqual([0, 0, 0, 0]);
    expect(await watermark(db())).toBe('1000');
    expect(await rowsAboveWatermark(db())).toBe(0);
    expect(await storedHeights(db())).toEqual(['1', '999', '1000']);
  });
});
