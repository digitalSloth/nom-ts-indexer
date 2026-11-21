import type { Knex } from 'knex';

export type SeedState = 'empty' | 'seeded' | 'partial';

/**
 * Reports whether the seeders have run. `indexer_state.seeded_at` is set
 * once every seeder finishes. Seeded rows without that marker mean a seed
 * run stopped partway.
 */
export async function seedState(db: Knex): Promise<SeedState> {
  const state = await db('indexer_state').select('seeded_at').first();
  if (state?.seeded_at) return 'seeded';
  const account = await db('nom_accounts').select('id').first();
  return account ? 'partial' : 'empty';
}

/** Records that every seeder has finished. */
export async function markSeeded(db: Knex): Promise<void> {
  const now = new Date();
  const state = await db('indexer_state').select('id').first();
  if (state) {
    await db('indexer_state').where({ id: state.id }).update({ seeded_at: now });
  } else {
    await db('indexer_state').insert({
      last_indexed_momentum: 0,
      is_running: false,
      seeded_at: now,
      updated_at: now,
    });
  }
}
