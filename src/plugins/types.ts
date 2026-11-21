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
  /** Contract receive blocks only: 1 = the call succeeded, 2 = it failed and was rolled back. */
  callStatus: number | null;
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
 *   event handlers write through their `tx` argument
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

/**
 * The handlers write through `tx`, the transaction in which the registry
 * also moves the plugin's watermark. A momentum (live) or a catch-up
 * window commits its plugin rows and the watermark together, so no reader
 * sees a plugin row above the watermark.
 */
export interface ZenonIndexerPlugin {
  readonly name: string;
  init(ctx: PluginContext): Promise<void>;
  onAccountBlock(event: IndexedAccountBlockEvent, tx: Knex.Transaction): Promise<void>;
  onMomentum?(momentum: IndexedMomentumEvent, tx: Knex.Transaction): Promise<void>;
  shutdown(): Promise<void>;
}
