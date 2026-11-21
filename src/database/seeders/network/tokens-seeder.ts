import { promises as fs } from 'fs';
import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { genesisTimestamp } from '../genesis/genesis-file.js';

interface GenesisToken {
  owner: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDomain: string;
  tokenStandard: string;
  totalSupply: string;
  maxSupply: string;
  decimals: number;
  isBurnable: boolean;
  isMintable: boolean;
  isUtility: boolean;
}

interface GenesisData {
  GenesisTimestampSec: number;
  TokenConfig: {
    Tokens: GenesisToken[];
  };
}

/**
 * Seed genesis tokens (ZNN and QSR). Source file resolved from the GENESIS_PATH
 * env var (defaults to json/genesis.json).
 */
export async function seedNetworkTokens(): Promise<void> {
  console.log(`Seeding network tokens from ${genesisPath}...`);

  let genesisData: GenesisData;

  try {
    const fileContent = await fs.readFile(genesisPath, 'utf-8');
    genesisData = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to read ${genesisPath}: ${error}`);
  }

  const tokens = genesisData.TokenConfig.Tokens;
  const createdAt = genesisTimestamp(genesisData);

  for (const tokenData of tokens) {
    const ownerId = await accountRegistry.getOrCreate(db, tokenData.owner);

    await db('nom_tokens')
      .insert({
        owner_id: ownerId,
        name: tokenData.tokenName,
        symbol: tokenData.tokenSymbol,
        domain: tokenData.tokenDomain,
        token_standard: tokenData.tokenStandard,
        total_supply: BigInt(tokenData.totalSupply).toString(),
        initial_supply: BigInt(tokenData.totalSupply).toString(),
        max_supply: BigInt(tokenData.maxSupply).toString(),
        decimals: tokenData.decimals,
        is_burnable: tokenData.isBurnable,
        is_mintable: tokenData.isMintable,
        is_utility: tokenData.isUtility,
        created_at: createdAt,
      })
      .onConflict('token_standard')
      .merge();

    console.log(`  ✓ Token created: ${tokenData.tokenSymbol} (${tokenData.tokenStandard})`);
  }

  console.log('✓ Network tokens seeded successfully\n');
}
