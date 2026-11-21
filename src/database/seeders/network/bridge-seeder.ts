import { db } from '../../knex.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { INITIAL_ADMINISTRATOR_ADDRESS } from '../../../constants/zenon.js';
import { genesisTimestamp, readGenesis } from '../genesis/genesis-file.js';

/** Momentums the bridge stays halted after Unhalt (go-zenon `MinUnhaltDurationInMomentums`). */
const UNHALT_DURATION_IN_MOMENTUMS = 6 * 360;

/**
 * Seed the bridge contract's starting state: its administrator and the
 * settings row with the contract's defaults.
 */
export async function seedBridge(): Promise<void> {
  console.log('Seeding bridge data...');

  const startedAt = genesisTimestamp(await readGenesis<{ GenesisTimestampSec: number }>());
  const adminId = await accountRegistry.getOrCreate(db, INITIAL_ADMINISTRATOR_ADDRESS);

  const existing = await db('nom_bridge_admins').first();
  if (!existing) {
    await db('nom_bridge_admins').insert({
      account_id: adminId,
      nominated_at: startedAt,
      accepted_at: startedAt,
    });
  }
  console.log('  ✓ Bridge admin record created');

  await db('nom_bridge_settings')
    .insert({ id: 1, unhalt_duration: UNHALT_DURATION_IN_MOMENTUMS, updated_at: startedAt })
    .onConflict('id')
    .ignore();
  console.log('  ✓ Bridge settings created');

  console.log('✓ Bridge data seeded successfully\n');
}
