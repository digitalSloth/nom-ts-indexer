import { promises as fs } from 'fs';
import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';

const BATCH_SIZE = 500;

interface GenesisSwapEntry {
  keyIdHash: string;
  znn: number;
  qsr: number;
}

interface GenesisData {
  SwapConfig?: {
    Entries: GenesisSwapEntry[] | null;
  };
}

/**
 * Seed the legacy swap entries from the genesis file. Each entry holds the
 * ZNN and QSR a legacy key can retrieve through the swap contract.
 */
export async function seedGenesisSwapEntries(): Promise<void> {
  console.log(`Seeding genesis swap entries from ${genesisPath}...`);

  let genesisData: GenesisData;
  try {
    genesisData = JSON.parse(await fs.readFile(genesisPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Failed to read ${genesisPath}: ${error}`);
  }

  const entries = genesisData.SwapConfig?.Entries ?? [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const rows = entries.slice(i, i + BATCH_SIZE).map((entry) => ({
      key_id_hash: entry.keyIdHash.replace(/^0x/i, '').toLowerCase(),
      znn: BigInt(entry.znn).toString(),
      qsr: BigInt(entry.qsr).toString(),
    }));
    await db('nom_swap_entries').insert(rows).onConflict('key_id_hash').ignore();
  }

  console.log(`  ✓ ${entries.length} genesis swap entries`);
  console.log('✓ Genesis swap entries seeded successfully\n');
}
