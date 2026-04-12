import { db } from '../../knex.js';
import { BRIDGE_ADMIN_ADDRESS } from '../../../constants/zenon.js';

/**
 * Seed initial bridge admin
 */
export async function seedBridge(): Promise<void> {
  console.log('Seeding bridge data...');

  // Find bridge admin account
  const bridgeAdmin = await db('nom_accounts')
    .where({ address: BRIDGE_ADMIN_ADDRESS })
    .select('id')
    .first();

  if (!bridgeAdmin) {
    throw new Error(
      'Bridge admin account not found. Make sure to run network accounts seeder first.',
    );
  }

  // Check if bridge admin already exists
  const existing = await db('nom_bridge_admins').where({ account_id: bridgeAdmin.id }).first();

  if (!existing) {
    await db('nom_bridge_admins').insert({
      account_id: bridgeAdmin.id,
      nominated_at: new Date('2023-05-03 10:17:30'),
      accepted_at: new Date('2023-05-03 10:17:30'),
    });
  }

  console.log('  ✓ Bridge admin record created');
  console.log('✓ Bridge data seeded successfully\n');
}
