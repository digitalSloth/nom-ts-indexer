import { db } from '../../knex.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { INITIAL_ADMINISTRATOR_ADDRESS } from '../../../constants/zenon.js';
import { genesisTimestamp, readGenesis } from '../genesis/genesis-file.js';

/**
 * Seed the liquidity contract's starting state: its administrator, which
 * defaults to the bridge's initial administrator, and the settings row.
 */
export async function seedLiquidity(): Promise<void> {
  console.log('Seeding liquidity data...');

  const startedAt = genesisTimestamp(await readGenesis<{ GenesisTimestampSec: number }>());
  const adminId = await accountRegistry.getOrCreate(db, INITIAL_ADMINISTRATOR_ADDRESS);

  const existing = await db('nom_liquidity_admins').first();
  if (!existing) {
    await db('nom_liquidity_admins').insert({
      account_id: adminId,
      nominated_at: startedAt,
      accepted_at: startedAt,
    });
  }
  console.log('  ✓ Liquidity admin record created');

  await db('nom_liquidity_settings')
    .insert({ id: 1, updated_at: startedAt })
    .onConflict('id')
    .ignore();
  console.log('  ✓ Liquidity settings created');

  console.log('✓ Liquidity data seeded successfully\n');
}
