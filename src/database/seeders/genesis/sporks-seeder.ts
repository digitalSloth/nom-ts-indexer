import { promises as fs } from 'fs';
import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';

interface GenesisSpork {
  id: string;
  name: string;
  description: string;
  activated: boolean;
  enforcementHeight: number;
}

interface GenesisData {
  GenesisTimestampSec: number;
  SporkConfig?: {
    Sporks: GenesisSpork[] | null;
  };
}

/**
 * Seed the sporks defined in the genesis file. Mainnet defines none; devnet
 * genesis defines its sporks here instead of creating them on chain.
 */
export async function seedGenesisSporks(): Promise<void> {
  console.log(`Seeding genesis sporks from ${genesisPath}...`);

  let genesisData: GenesisData;
  try {
    genesisData = JSON.parse(await fs.readFile(genesisPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Failed to read ${genesisPath}: ${error}`);
  }

  const sporks = genesisData.SporkConfig?.Sporks ?? [];
  const createdAt = new Date(genesisData.GenesisTimestampSec * 1000);

  for (const spork of sporks) {
    await db('nom_sporks')
      .insert({
        hash: spork.id.replace(/^0x/i, '').toLowerCase(),
        account_block_id: null,
        name: spork.name,
        description: spork.description,
        is_active: spork.activated,
        enforcement_height: spork.activated ? spork.enforcementHeight : null,
        created_at: createdAt,
        activated_at: spork.activated ? createdAt : null,
      })
      .onConflict('hash')
      .ignore();
  }

  console.log(`  ✓ ${sporks.length} genesis sporks`);
  console.log('✓ Genesis sporks seeded successfully\n');
}
