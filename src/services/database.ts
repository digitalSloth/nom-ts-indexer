import type { Knex } from 'knex';
import { db } from '../database/knex.js';

/**
 * Database service for handling all Zenon-specific database operations
 * Provides a clean abstraction over Knex query builder
 */
class DatabaseService {
  /**
   * Get or create indexer state
   */
  async getIndexerState() {
    let state = await db('indexer_state').first();
    if (!state) {
      [state] = await db('indexer_state')
        .insert({ last_indexed_momentum: BigInt(0), is_running: false, updated_at: new Date() })
        .returning('*');
    }
    return state;
  }

  /**
   * Update indexer state
   */
  async updateIndexerState(data: { last_indexed_momentum?: bigint; is_running?: boolean }) {
    const state = await this.getIndexerState();
    const [updated] = await db('indexer_state').where({ id: state.id }).update(data).returning('*');
    return updated;
  }

  /**
   * Records `height` as the last indexed momentum. Runs inside the
   * momentum's own transaction, so the stored height always matches the
   * last committed momentum.
   */
  async setLastIndexedMomentum(tx: Knex, height: bigint): Promise<void> {
    await tx('indexer_state').update({ last_indexed_momentum: height, updated_at: new Date() });
  }

  /**
   * Get current database height (last indexed momentum).
   * Reads from IndexerState (constant-time), falling back to START_HEIGHT and
   * then MAX(height) when the stored height is zero. With no momentums the
   * height is 0, so the first momentum indexed is momentum 1 with its
   * genesis account blocks. The genesis seeders write balances, pillars
   * and settings; the blocks themselves are indexed like any others.
   */
  async getCurrentHeight(): Promise<bigint> {
    const state = await this.getIndexerState();
    // pg returns bigint columns as strings
    const indexed = BigInt(state.last_indexed_momentum ?? 0);
    if (indexed > 0n) return indexed;

    const startHeight = process.env.START_HEIGHT;
    if (startHeight) {
      const parsed = BigInt(startHeight);
      if (parsed > 0n) return parsed;
    }

    const row = await db('nom_momentums').max('height as height').first();
    return BigInt(row?.height ?? 0);
  }

  /** Hash of the stored momentum at `height`, or null when none is stored. */
  async getMomentumHash(height: bigint): Promise<string | null> {
    const row = await db('nom_momentums').where({ height }).select('hash').first();
    return row?.hash ?? null;
  }

  /**
   * Get momentum by hash
   */
  async getMomentumByHash(hash: string) {
    return db('nom_momentums').where({ hash }).first();
  }

  /**
   * Get momentum by height
   */
  async getMomentumByHeight(height: bigint) {
    return db('nom_momentums').where({ height }).first();
  }

  /**
   * Get account block by hash
   */
  async getAccountBlockByHash(hash: string) {
    return db('nom_account_blocks').where({ hash }).first();
  }

  /**
   * Get account by address
   */
  async getAccountByAddress(address: string) {
    return db('nom_accounts').where({ address }).first();
  }

  /**
   * Get token by token standard
   */
  async getTokenByStandard(tokenStandard: string) {
    return db('nom_tokens').where({ token_standard: tokenStandard }).first();
  }

  /**
   * Get pillar by producer account
   */
  async getPillarByProducerAccount(producerAccountId: number) {
    return db('nom_pillars').where({ producer_account_id: producerAccountId }).first();
  }

  /**
   * Approximate row counts from the planner statistics in pg_class.
   * Constant time on any table size, unlike COUNT(*). reltuples is -1
   * before a table's first ANALYZE, so it is clamped to 0.
   */
  async getStats() {
    const tables = {
      momentums: 'nom_momentums',
      accountBlocks: 'nom_account_blocks',
      accounts: 'nom_accounts',
      tokens: 'nom_tokens',
      pillars: 'nom_pillars',
    };

    const result = await db.raw(
      `SELECT relname, GREATEST(reltuples, 0)::bigint AS estimate
       FROM pg_class
       WHERE oid IN (SELECT to_regclass(name) FROM unnest(?::text[]) AS name)`,
      [Object.values(tables)],
    );
    const estimates = new Map<string, number>(
      result.rows.map((row: { relname: string; estimate: string }) => [
        row.relname,
        Number(row.estimate),
      ]),
    );

    return {
      momentums: estimates.get(tables.momentums) ?? 0,
      accountBlocks: estimates.get(tables.accountBlocks) ?? 0,
      accounts: estimates.get(tables.accounts) ?? 0,
      tokens: estimates.get(tables.tokens) ?? 0,
      pillars: estimates.get(tables.pillars) ?? 0,
    };
  }

  /**
   * Execute a function within a transaction
   * Ensures atomicity for complex operations
   */
  async transaction<T>(fn: (tx: Knex.Transaction) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  }

  /**
   * Get the Knex instance for direct access
   */
  getDb() {
    return db;
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    await db.destroy();
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
