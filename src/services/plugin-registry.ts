import path from 'node:path';
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
    } catch {}
  }

  return {
    accountBlockId: row.id,
    hash: row.hash,
    blockType: row.block_type,
    height: row.height,
    fromAddress: row.account_address,
    toAddress: row.to_account_address,
    amount: row.amount,
    tokenStandard: row.token_standard ?? null,
    rawData: row.data_raw ? Buffer.from(row.data_raw, 'base64') : Buffer.alloc(0),
    decodedArgs,
    momentum: {
      momentumId: row.momentum_id,
      height: row.momentum_height,
      hash: row.momentum_hash,
      timestamp: Math.floor(row.momentum_created_at.getTime() / 1000),
    },
    contractMethod: row.contract_method_name
      ? { contractName: row.contract_name ?? 'Common', methodName: row.contract_method_name }
      : null,
    pairedBlockHash: row.paired_hash ?? null,
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

  private async updatePluginWatermark(name: string, height: bigint): Promise<void> {
    const db = databaseService.getDb();
    await db('indexer_plugin_state')
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

        const initialWatermark = entry.startHeight && entry.startHeight > 0
          ? String(entry.startHeight - 1)
          : '0';

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

  async catchUp(currentDbHeight: bigint): Promise<void> {
    const db = databaseService.getDb();

    for (const { plugin, logger } of this.plugins) {
      try {
        const watermark = await this.getPluginWatermark(plugin.name);
        if (watermark < currentDbHeight) {
          logger.info(`catching up from ${watermark} to ${currentDbHeight}`);
          await this.iterateAccountBlocks(db, watermark + 1n, currentDbHeight, async (event) => {
            await plugin.onAccountBlock(event);
          });
          await this.updatePluginWatermark(plugin.name, currentDbHeight);
        }
      } catch (err) {
        logger.error(`catchUp failed`, err);
      }
    }
  }

  private async iterateAccountBlocks(
    db: any,
    from: bigint,
    to: bigint,
    onBlock: (event: IndexedAccountBlockEvent) => Promise<void>,
  ): Promise<void> {
    const PAGE_SIZE = 1000;
    let cursor: { height: bigint; id: number } | undefined;

    for (;;) {
      let query = baseQuery(db)
        .where('ab.height', '>=', from.toString())
        .andWhere('ab.height', '<=', to.toString());

      if (cursor) {
        query = query.where(function (this: any) {
          this.where('ab.height', '>', cursor!.height.toString()).orWhere(function (this: any) {
            this.where('ab.height', cursor!.height.toString()).andWhere('ab.id', '>', cursor!.id);
          });
        });
      }

      const rows = await query.orderBy('ab.height', 'asc').orderBy('ab.id', 'asc').limit(PAGE_SIZE);

      if (rows.length === 0) break;

      for (const row of rows) {
        await onBlock(toEvent(row));
      }

      const last = rows[rows.length - 1];
      cursor = { height: last.height, id: last.id };

      if (rows.length < PAGE_SIZE) break;
    }
  }

  async dispatchAccountBlock(event: IndexedAccountBlockEvent): Promise<void> {
    await Promise.allSettled(
      this.plugins.map(({ plugin, logger }) =>
        plugin.onAccountBlock(event).catch((err) => logger.error('onAccountBlock error', err)),
      ),
    );
  }

  async dispatchMomentum(momentum: IndexedMomentumEvent): Promise<void> {
    const results = await Promise.allSettled(
      this.plugins
        .filter(({ plugin }) => typeof plugin.onMomentum === 'function')
        .map(async ({ plugin, logger }) => {
          await plugin.onMomentum!(momentum);
          return plugin.name;
        }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        await this.updatePluginWatermark(result.value, momentum.height);
      }
    }
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
