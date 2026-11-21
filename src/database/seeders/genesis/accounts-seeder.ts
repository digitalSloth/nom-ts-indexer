import { promises as fs } from 'fs';
import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';
import { ZNN_TOKEN_STANDARD, QSR_TOKEN_STANDARD } from '../../../constants/zenon.js';

interface GenesisBlock {
  Address: string;
  BalanceList: Record<string, string>;
}

interface GenesisData {
  GenesisBlocks: {
    Blocks: GenesisBlock[];
  };
}

/**
 * Seed genesis accounts. Source file resolved from the GENESIS_PATH env var
 * (defaults to json/genesis.json).
 */
export async function seedGenesisAccounts(): Promise<void> {
  console.log(`Seeding genesis accounts from ${genesisPath}...`);

  let genesisData: GenesisData;

  try {
    const fileContent = await fs.readFile(genesisPath, 'utf-8');
    genesisData = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to read ${genesisPath}: ${error}`);
  }

  const accounts = genesisData.GenesisBlocks.Blocks;

  // Get ZNN and QSR token records
  const znnToken = await db('nom_tokens')
    .where({ token_standard: ZNN_TOKEN_STANDARD })
    .select('id')
    .first();

  const qsrToken = await db('nom_tokens')
    .where({ token_standard: QSR_TOKEN_STANDARD })
    .select('id')
    .first();

  if (!znnToken || !qsrToken) {
    throw new Error('ZNN or QSR token not found. Make sure to run network tokens seeder first.');
  }

  let accountCount = 0;

  for (const accountData of accounts) {
    const znnBalance = BigInt(accountData.BalanceList[ZNN_TOKEN_STANDARD] || '0');
    const qsrBalance = BigInt(accountData.BalanceList[QSR_TOKEN_STANDARD] || '0');

    // Create or update account
    const [account] = await db('nom_accounts')
      .insert({ address: accountData.Address })
      .onConflict('address')
      .merge()
      .returning('id');

    // Genesis balances count as received, so balance = received - sent
    if (znnBalance > 0n) {
      await db('nom_account_tokens')
        .insert({
          account_id: account.id,
          token_id: znnToken.id,
          balance: znnBalance.toString(),
          received: znnBalance.toString(),
          updated_at: new Date(),
        })
        .onConflict(['account_id', 'token_id'])
        .merge({
          balance: znnBalance.toString(),
          received: znnBalance.toString(),
          updated_at: new Date(),
        });
    }

    if (qsrBalance > 0n) {
      await db('nom_account_tokens')
        .insert({
          account_id: account.id,
          token_id: qsrToken.id,
          balance: qsrBalance.toString(),
          received: qsrBalance.toString(),
          updated_at: new Date(),
        })
        .onConflict(['account_id', 'token_id'])
        .merge({
          balance: qsrBalance.toString(),
          received: qsrBalance.toString(),
          updated_at: new Date(),
        });
    }

    accountCount++;
  }

  console.log(`  Seeded ${accountCount} genesis accounts`);
}
