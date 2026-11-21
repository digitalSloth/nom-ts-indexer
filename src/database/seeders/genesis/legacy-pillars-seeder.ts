import { db } from '../../knex.js';
import { readGenesis } from './genesis-file.js';

interface GenesisData {
  PillarConfig?: {
    LegacyEntries?: { keyIdHash: string; pillarCount: number }[] | null;
  };
}

/**
 * Seed the legacy pillar slots from the genesis file. Each legacy key can
 * register its pillar count of pillars through RegisterLegacy.
 */
export async function seedGenesisLegacyPillars(): Promise<void> {
  console.log('Seeding genesis legacy pillar entries...');

  const genesis = await readGenesis<GenesisData>();
  const rows = (genesis.PillarConfig?.LegacyEntries ?? []).map((entry) => ({
    key_id_hash: entry.keyIdHash.replace(/^0x/i, '').toLowerCase(),
    pillar_count: entry.pillarCount,
    remaining_count: entry.pillarCount,
  }));

  if (rows.length > 0) {
    await db('nom_legacy_pillar_entries').insert(rows).onConflict('key_id_hash').ignore();
  }

  console.log(`  ✓ ${rows.length} genesis legacy pillar entries`);
  console.log('✓ Genesis legacy pillar entries seeded successfully\n');
}
