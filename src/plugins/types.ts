export interface IndexedMomentumEvent {
  momentumId: number;
  height: bigint;
  hash: string;
  timestamp: number;
}

export interface IndexedAccountBlockEvent {
  accountBlockId: number;
  hash: string;
  blockType: number;
  height: bigint;
  fromAddress: string;
  toAddress: string;
  amount: string;
  tokenStandard: string | null;
  rawData: Buffer;
  decodedArgs: Record<string, unknown> | null;
  momentum: IndexedMomentumEvent;
  contractMethod: { contractName: string; methodName: string } | null;
  pairedBlockHash: string | null;
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
}

import type { Knex } from 'knex';

/**
 * Plugin database handle. Extends Knex with legacy `execute`/`query` methods
 * for backward compatibility with plugins that use raw SQL.
 *
 * New plugins should use the Knex query builder directly:
 *   db('table').where({ column: value }).select('*')
 *   db.transaction(async (tx) => { ... })
 */
export type PluginDb = Knex & {
  execute(sql: string, ...params: unknown[]): Promise<void>;
  query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
};

export interface PluginContext {
  config: Record<string, unknown>;
  log: PluginLogger;
  db: PluginDb;
  databaseUrl: string;
  genesisPath: string;
}

export interface ZenonIndexerPlugin {
  readonly name: string;
  init(ctx: PluginContext): Promise<void>;
  onAccountBlock(event: IndexedAccountBlockEvent): Promise<void>;
  onMomentum?(momentum: IndexedMomentumEvent): Promise<void>;
  shutdown(): Promise<void>;
}
