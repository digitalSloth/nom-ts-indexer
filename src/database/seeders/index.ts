import { connectDatabase, db, disconnectDatabase } from '../index.js';
import { markSeeded, seedState } from './seed-state.js';
import { seedNetworkAccounts } from './network/accounts-seeder.js';
import { seedNetworkTokens } from './network/tokens-seeder.js';
import { seedBridge } from './network/bridge-seeder.js';
import { seedLiquidity } from './network/liquidity-seeder.js';
import { syncContractMethods } from '../contract-methods.js';
import { seedGenesisAccounts } from './genesis/accounts-seeder.js';
import { seedGenesisPillars } from './genesis/pillars-seeder.js';
import { seedGenesisPlasma } from './genesis/plasma-seeder.js';
import { seedGenesisLegacyPillars } from './genesis/legacy-pillars-seeder.js';
import { seedGenesisSporks } from './genesis/sporks-seeder.js';
import { seedGenesisSwapEntries } from './genesis/swap-entries-seeder.js';

/**
 * Run all Network seeders in order
 * These seed the basic network configuration
 */
export async function runNetworkSeeders(): Promise<void> {
  console.log('\n📦 Running Network Seeders...\n');

  await seedNetworkAccounts();
  await seedNetworkTokens();
  await seedBridge();
  await seedLiquidity();
  console.log('Seeding contract methods...');
  const methodCount = await syncContractMethods(db);
  console.log(`  ✓ ${methodCount} contract methods seeded`);
  console.log('✓ Contract methods seeded successfully\n');

  console.log('✓ All network seeders completed\n');
}

/**
 * Run all Genesis seeders in order
 * These seed the genesis block data
 */
export async function runGenesisSeeders(): Promise<void> {
  console.log('\n🌱 Running Genesis Seeders...\n');

  await seedGenesisAccounts();
  await seedGenesisPillars();
  await seedGenesisLegacyPillars();
  await seedGenesisPlasma();
  await seedGenesisSporks();
  await seedGenesisSwapEntries();

  console.log('✓ All genesis seeders completed\n');
}

/**
 * Run all seeders (Network + Genesis)
 */
export async function runAllSeeders(): Promise<void> {
  console.log('\n🚀 Running All Seeders...\n');

  await runNetworkSeeders();
  await runGenesisSeeders();

  console.log('✅ All seeders completed successfully!\n');
}

/**
 * Main entry point for running seeders. Seeds an empty database once and
 * skips a seeded one, because the seeders overwrite indexed balances and
 * supplies and duplicate the genesis pillars.
 */
async function main() {
  try {
    // Connect to database
    await connectDatabase();

    const state = await seedState(db);
    if (state === 'seeded') {
      console.log('✓ Database already seeded, skipping seeders\n');
    } else if (state === 'partial') {
      throw new Error(
        'Database holds rows from an unfinished seed run. Run `npm run reset` to start again.',
      );
    } else {
      await runAllSeeders();
      await markSeeded(db);
    }

    // Disconnect from database
    await disconnectDatabase();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeder error:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
