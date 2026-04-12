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
   * Get current database height (last indexed momentum).
   * Reads from IndexerState (constant-time), falling back to MAX(height) only
   * if the state row is missing or zero — covers fresh installs and recovery
   * from a crash mid-batch.
   */
  async getCurrentHeight(): Promise<bigint> {
    const state = await this.getIndexerState();
    if (state.last_indexed_momentum && state.last_indexed_momentum > BigInt(0)) {
      return state.last_indexed_momentum;
    }

    const startHeight = process.env.START_HEIGHT;
    if (startHeight) {
      const parsed = BigInt(startHeight);
      if (parsed > 0n) return parsed;
    }

    const row = await db('nom_momentums').max('height').first();
    return row?.height ?? BigInt(1);
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
   * Get statistics
   */
  async getStats() {
    const [momentumCount, accountBlockCount, accountCount, tokenCount, pillarCount] =
      await Promise.all([
        db('nom_momentums')
          .count('* as count')
          .first()
          .then((r) => Number(r?.count ?? 0)),
        db('nom_account_blocks')
          .count('* as count')
          .first()
          .then((r) => Number(r?.count ?? 0)),
        db('nom_accounts')
          .count('* as count')
          .first()
          .then((r) => Number(r?.count ?? 0)),
        db('nom_tokens')
          .count('* as count')
          .first()
          .then((r) => Number(r?.count ?? 0)),
        db('nom_pillars')
          .count('* as count')
          .first()
          .then((r) => Number(r?.count ?? 0)),
      ]);

    return {
      momentums: momentumCount,
      accountBlocks: accountBlockCount,
      accounts: accountCount,
      tokens: tokenCount,
      pillars: pillarCount,
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
