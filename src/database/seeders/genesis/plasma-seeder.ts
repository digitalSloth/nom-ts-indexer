import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { genesisTimestamp, readGenesis } from './genesis-file.js';

interface GenesisFusion {
  owner: string;
  id: string;
  amount: number | string;
  withdrawHeight: number;
  beneficiaryAddress: string;
}

interface GenesisData {
  GenesisTimestampSec: number;
  PlasmaConfig?: {
    Fusions: GenesisFusion[] | null;
  };
}

/**
 * Seed the plasma fusions the genesis file creates. They have no Fuse block,
 * so account_block_id stays null and the fusion id is the row's hash.
 */
export async function seedGenesisPlasma(): Promise<void> {
  console.log(`Seeding genesis fusions from ${genesisPath}...`);

  const genesis = await readGenesis<GenesisData>();
  const startedAt = genesisTimestamp(genesis);
  const fusions = genesis.PlasmaConfig?.Fusions ?? [];

  for (const fusion of fusions) {
    await db('nom_plasma')
      .insert({
        from_account_id: await accountRegistry.getOrCreate(db, fusion.owner),
        to_account_id: await accountRegistry.getOrCreate(db, fusion.beneficiaryAddress),
        account_block_id: null,
        hash: fusion.id,
        amount: BigInt(fusion.amount).toString(),
        started_at: startedAt,
        expiration_height: fusion.withdrawHeight,
      })
      .onConflict('hash')
      .ignore();
  }

  console.log(`  ✓ ${fusions.length} genesis fusions seeded`);
  console.log('✓ Genesis fusions seeded successfully\n');
}
