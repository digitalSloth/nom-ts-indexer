import { connectDatabase, disconnectDatabase } from '../index.js';
import { seedNetworkAccounts } from './network/accounts-seeder.js';
import { seedNetworkTokens } from './network/tokens-seeder.js';
import { seedBridge } from './network/bridge-seeder.js';
import { seedContractMethods } from './network/contract-method-seeder.js';
import { seedGenesisAccounts } from './genesis/accounts-seeder.js';
import { seedGenesisPillars } from './genesis/pillars-seeder.js';

/**
 * Run all Network seeders in order
 * These seed the basic network configuration
 */
export async function runNetworkSeeders(): Promise<void> {
  console.log('\n📦 Running Network Seeders...\n');

  await seedNetworkAccounts();
  await seedNetworkTokens();
  await seedBridge();
  await seedContractMethods();

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
 * Main entry point for running seeders
 */
async function main() {
  try {
    // Connect to database
    await connectDatabase();

    // Run all seeders
    await runAllSeeders();

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
