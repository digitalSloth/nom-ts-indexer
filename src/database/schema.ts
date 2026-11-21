import type { Knex } from 'knex';

/**
 * Schema that holds the indexer's own tables: the nom_ tables,
 * indexer_state, plugin tables and the Knex migration tables.
 */
export const INDEXER_SCHEMA = 'indexer';

/**
 * Creates the indexer schema when it is missing. Knex looks up its
 * migration table in the search path before any migration runs, so
 * every migrate call runs this first.
 */
export async function ensureIndexerSchema(db: Knex): Promise<void> {
  await db.raw('CREATE SCHEMA IF NOT EXISTS ??', [INDEXER_SCHEMA]);
}
