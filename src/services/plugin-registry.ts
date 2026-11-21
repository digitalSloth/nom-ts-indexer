import path from 'node:path';
import type { Knex } from 'knex';
import { pluginsConfig, isLocalPlugin } from '../config/plugins.js';
import { genesisPath } from '../config/genesis.js';
import { databaseService } from './database.js';
import type {
  ZenonIndexerPlugin,
  PluginContext,
  PluginDb,
  PluginLogger,
  IndexedAccountBlockEvent,
  IndexedMomentumEvent,
} from '../plugins/types.js';

/**
 * Convert PostgreSQL-style $N positional bindings to knex-style ? bindings.
 */
function convertPgBindings(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const matches = [...sql.matchAll(/\$(\d+)/g)];
  if (matches.length === 0) return { sql, params };

  const orderedParams: unknown[] = [];
  let converted = sql;
  for (const match of matches) {
    const idx = parseInt(match[1], 10) - 1;
    orderedParams.push(params[idx]);
    converted = converted.replace(match[0], '?');
  }

  return { sql: converted, params: orderedParams };
}

function baseQuery(db: any) {
  return db('nom_account_blocks as ab')
    .leftJoin('nom_accounts as acc', 'ab.account_id', 'acc.id')
    .leftJoin('nom_accounts as to_acc', 'ab.to_account_id', 'to_acc.id')
    .leftJoin('nom_tokens as tok', 'ab.token_id', 'tok.id')
    .leftJoin('nom_momentums as mom', 'ab.momentum_id', 'mom.id')
    .leftJoin('nom_account_block_data as data', 'ab.id', 'data.account_block_id')
    .leftJoin('nom_contract_methods as cm', 'ab.contract_method_id', 'cm.id')
    .leftJoin('nom_contracts as con', 'cm.contract_id', 'con.id')
    .leftJoin('nom_account_blocks as paired', 'ab.paired_account_block_id', 'paired.id')
    .select(
      'ab.id',
      'ab.hash',
      'ab.block_type',
      'ab.height',
      'ab.amount',
      'ab.call_status',
      'acc.address as account_address',
      'to_acc.address as to_account_address',
      'tok.token_standard',
      'mom.id as momentum_id',
      'mom.height as momentum_height',
      'mom.hash as momentum_hash',
      'mom.created_at as momentum_created_at',
      'data.raw as data_raw',
      'data.decoded as data_decoded',
      'cm.name as contract_method_name',
      'con.name as contract_name',
      'paired.hash as paired_hash',
    );
}

function toEvent(row: any): IndexedAccountBlockEvent {
  let decodedArgs: Record<string, unknown> | null = null;
  if (row.data_decoded) {
    try {
      decodedArgs = JSON.parse(row.data_decoded);
    } catch {
      // Not valid JSON: deliver the event without decoded args.
    }
  }

  return {
    accountBlockId: row.id,
    hash: row.hash,
    blockType: row.block_type,
    // pg returns bigint columns as strings
    height: BigInt(row.height),
    fromAddress: row.account_address,
    toAddress: row.to_account_address,
    amount: row.amount,
    tokenStandard: row.token_standard ?? null,
    rawData: row.data_raw ? Buffer.from(row.data_raw, 'base64') : Buffer.alloc(0),
    decodedArgs,
    momentum: {
      momentumId: row.momentum_id,
      height: BigInt(row.momentum_height),
      hash: row.momentum_hash,
      timestamp: Math.floor(row.momentum_created_at.getTime() / 1000),
    },
    contractMethod: row.contract_method_name
      ? { contractName: row.contract_name ?? 'Common', methodName: row.contract_method_name }
      : null,
    pairedBlockHash: row.paired_hash ?? null,
    callStatus: row.call_status ?? null,
  };
}

interface LoadedPlugin {
  plugin: ZenonIndexerPlugin;
  logger: PluginLogger;
}

class PluginRegistry {
  private plugins: LoadedPlugin[] = [];

  private async getPluginWatermark(name: string): Promise<bigint> {
    const db = databaseService.getDb();
    const row = await db('indexer_plugin_state').select('watermark').where('name', name).first();
    return row ? BigInt(row.watermark) : 0n;
  }

  private async updatePluginWatermark(
    tx: Knex.Transaction,
    name: string,
    height: bigint,
  ): Promise<void> {
    await tx('indexer_plugin_state')
      .where('name', name)
      .update({ watermark: height.toString(), updated_at: new Date() });
  }

  async load(): Promise<void> {
    if (pluginsConfig.length === 0) return;

    const databaseUrl = process.env.DATABASE_URL ?? '';
    const db = databaseService.getDb();

    for (const entry of pluginsConfig) {
      try {
        let mod: any;

        if (isLocalPlugin(entry)) {
          const pluginDir = path.resolve(entry.package);
          mod = await import(
            path.join(pluginDir, 'dist', 'plugins', path.basename(entry.package), 'src', 'index.js')
          );
        } else {
          mod = await import(entry.package);
        }

        const factory = mod.default ?? mod;
        if (typeof factory !== 'function') {
          console.warn(`Plugin ${entry.package}: default export is not a function, skipping`);
          continue;
        }

        const plugin = factory() as ZenonIndexerPlugin;

        const initialWatermark =
          entry.startHeight && entry.startHeight > 0 ? String(entry.startHeight - 1) : '0';

        await db('indexer_plugin_state')
          .insert({ name: plugin.name, watermark: initialWatermark, updated_at: new Date() })
          .onConflict('name')
          .ignore();

        const logger: PluginLogger = {
          info: (msg: string) => console.log(`[plugin:${entry.package}] ${msg}`),
          warn: (msg: string) => console.warn(`[plugin:${entry.package}] ${msg}`),
          error: (msg: string, err?: unknown) =>
            console.error(`[plugin:${entry.package}] ${msg}`, err),
        };

        const pluginDb = Object.assign(db, {
          execute: async (sql: string, ...params: unknown[]) => {
            const { sql: convertedSql, params: convertedParams } = convertPgBindings(sql, params);
            await db.raw(convertedSql, convertedParams as any[]);
          },
          query: async <T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> => {
            const { sql: convertedSql, params: convertedParams } = convertPgBindings(sql, params);
            const result = await db.raw(convertedSql, convertedParams as any[]);
            return result.rows as T[];
          },
        }) as PluginDb;

        const ctx: PluginContext = {
          config: entry.config ?? {},
          log: logger,
          db: pluginDb,
          databaseUrl,
          genesisPath,
        };

        await plugin.init(ctx);

        this.plugins.push({ plugin, logger });
        logger.info(`loaded`);
      } catch (err) {
        console.error(`Failed to load plugin ${entry.package}:`, err);
      }
    }
  }

  /**
   * Replay the blocks each plugin has not seen, up to `currentDbHeight`.
   * Each window's plugin rows and watermark commit in one transaction, so
   * a failed replay resumes after the last committed window. A plugin
   * whose replay fails is shut down for this run, so live dispatch cannot
   * move its watermark past the unreplayed range. The next start retries
   * it.
   */
  async catchUp(currentDbHeight: bigint): Promise<void> {
    const db = databaseService.getDb();
    const failed: LoadedPlugin[] = [];

    for (const loaded of this.plugins) {
      const { plugin, logger } = loaded;
      try {
        const watermark = await this.getPluginWatermark(plugin.name);
        if (watermark < currentDbHeight) {
          logger.info(`catching up from ${watermark} to ${currentDbHeight}`);
          await this.iterateAccountBlocks(
            db,
            watermark + 1n,
            currentDbHeight,
            (event, tx) => plugin.onAccountBlock(event, tx),
            (height, tx) => this.updatePluginWatermark(tx, plugin.name, height),
          );
        }
      } catch (err) {
        logger.error(`catchUp failed, plugin disabled until restart`, err);
        failed.push(loaded);
      }
    }

    await this.halt(failed);
  }

  /**
   * Remove plugins from dispatch and shut them down. A halted plugin's
   * watermark stays where it is, so the next start replays from there.
   */
  private async halt(halted: LoadedPlugin[]): Promise<void> {
    if (halted.length === 0) return;
    this.plugins = this.plugins.filter((loaded) => !halted.includes(loaded));
    for (const { plugin, logger } of halted) {
      try {
        await plugin.shutdown();
      } catch (err) {
        logger.error(`shutdown error`, err);
      }
    }
  }

  /**
   * Replay account blocks whose momentum height is in [from, to], in chain
   * order. Walks fixed momentum-height windows so no page sorts the whole
   * remaining chain. Each window runs in one transaction that ends with
   * `onWindowDone` and the window's last height.
   */
  private async iterateAccountBlocks(
    db: any,
    from: bigint,
    to: bigint,
    onBlock: (event: IndexedAccountBlockEvent, tx: Knex.Transaction) => Promise<void>,
    onWindowDone: (height: bigint, tx: Knex.Transaction) => Promise<void>,
  ): Promise<void> {
    const WINDOW = 1000n;

    for (let start = from; start <= to; start += WINDOW) {
      const end = start + WINDOW - 1n < to ? start + WINDOW - 1n : to;
      const rows = await baseQuery(db)
        .whereBetween('mom.height', [start.toString(), end.toString()])
        .orderBy('mom.height', 'asc')
        .orderBy('ab.id', 'asc');

      await db.transaction(async (tx: Knex.Transaction) => {
        for (const row of rows) {
          await onBlock(toEvent(row), tx);
        }
        await onWindowDone(end, tx);
      });
    }
  }

  /**
   * Deliver a committed momentum to every plugin: its account blocks in
   * order, then onMomentum where implemented, then the watermark, all in
   * one transaction per plugin. A plugin that throws rolls the momentum
   * back and is halted for the run, so its watermark stays below the
   * momentum and the next start replays it.
   */
  async dispatchMomentum(
    momentum: IndexedMomentumEvent,
    blocks: IndexedAccountBlockEvent[],
  ): Promise<void> {
    const db = databaseService.getDb();
    const failed: LoadedPlugin[] = [];
    await Promise.allSettled(
      this.plugins.map(async (loaded) => {
        const { plugin } = loaded;
        try {
          await db.transaction(async (tx) => {
            for (const event of blocks) {
              await plugin.onAccountBlock(event, tx);
            }
            await plugin.onMomentum?.(momentum, tx);
            await this.updatePluginWatermark(tx, plugin.name, momentum.height);
          });
        } catch (err) {
          loaded.logger.error('dispatch failed, plugin disabled until restart', err);
          failed.push(loaded);
        }
      }),
    );
    await this.halt(failed);
  }

  async shutdown(): Promise<void> {
    for (const { plugin, logger } of this.plugins) {
      try {
        await plugin.shutdown();
      } catch (err) {
        logger.error(`shutdown error`, err);
      }
    }
    this.plugins = [];
  }
}

export const pluginRegistry = new PluginRegistry();
