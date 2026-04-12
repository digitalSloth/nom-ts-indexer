import { db } from '../../knex.js';
import {
  EMBEDDED_CONTRACTS,
  BURN_ADDRESS,
  BRIDGE_ADMIN_ADDRESS,
} from '../../../constants/zenon.js';

/**
 * Seed network accounts:
 * - Burn address
 * - All embedded contracts
 * - Bridge admin address
 */
export async function seedNetworkAccounts(): Promise<void> {
  console.log('Seeding network accounts...');

  // Insert burn address
  await db('nom_accounts')
    .insert({ address: BURN_ADDRESS, name: 'Burn Address', is_embedded_contract: false })
    .onConflict('address')
    .merge();
  console.log('  ✓ Burn address created');

  // Insert all embedded contracts (skip synthetic entries without an address, e.g. Common)
  const addressedContracts = EMBEDDED_CONTRACTS.filter(
    (entry): entry is typeof entry & { address: string } => entry.address !== null,
  );
  for (const contract of addressedContracts) {
    await db('nom_accounts')
      .insert({
        address: contract.address,
        name: contract.name,
        is_embedded_contract: true,
      })
      .onConflict('address')
      .merge();
  }
  console.log(`  ✓ ${addressedContracts.length} embedded contracts created`);

  // Insert bridge admin address
  await db('nom_accounts')
    .insert({
      address: BRIDGE_ADMIN_ADDRESS,
      name: 'Bridge admin',
      is_embedded_contract: false,
    })
    .onConflict('address')
    .merge();
  console.log('  ✓ Bridge admin address created');

  console.log('✓ Network accounts seeded successfully\n');
}
