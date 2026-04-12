import { promises as fs } from 'fs';
import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { DECIMALS } from '../../../constants/zenon.js';

const GENESIS_TIMESTAMP = new Date('2021-11-24T12:00:00Z');

interface GenesisPillar {
  Name: string;
  StakeAddress: string;
  BlockProducingAddress: string;
  RewardWithdrawAddress: string;
  GiveBlockRewardPercentage: number;
  GiveDelegateRewardPercentage: number;
}

interface GenesisData {
  PillarConfig: {
    Pillars: GenesisPillar[];
  };
}

/**
 * Seed genesis pillars. Source file resolved from the GENESIS_PATH env var
 * (defaults to json/genesis.json).
 */
export async function seedGenesisPillars(): Promise<void> {
  console.log(`Seeding genesis pillars from ${genesisPath}...`);

  let genesisData: GenesisData;

  try {
    const fileContent = await fs.readFile(genesisPath, 'utf-8');
    genesisData = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to read ${genesisPath}: ${error}`);
  }

  const pillars = genesisData.PillarConfig.Pillars;

  for (const pillarData of pillars) {
    const ownerId = await accountRegistry.getOrCreate(db, pillarData.StakeAddress);
    const producerAccountId = await accountRegistry.getOrCreate(
      db,
      pillarData.BlockProducingAddress,
    );
    const withdrawAccountId = await accountRegistry.getOrCreate(
      db,
      pillarData.RewardWithdrawAddress,
    );

    const slug = pillarData.Name.toLowerCase().replace(/\s+/g, '-');

    // Create pillar
    const [pillar] = await db('nom_pillars')
      .insert({
        owner_id: ownerId,
        producer_account_id: producerAccountId,
        withdraw_account_id: withdrawAccountId,
        name: pillarData.Name,
        slug,
        qsr_burn: BigInt(150000 * DECIMALS),
        momentum_rewards: pillarData.GiveBlockRewardPercentage,
        delegate_rewards: pillarData.GiveDelegateRewardPercentage,
        is_legacy: true,
        created_at: GENESIS_TIMESTAMP,
      })
      .returning('id');

    // Create initial update history
    await db('nom_pillar_update_histories').insert({
      pillar_id: pillar.id,
      producer_account_id: producerAccountId,
      withdraw_account_id: withdrawAccountId,
      momentum_rewards: pillarData.GiveBlockRewardPercentage,
      delegate_rewards: pillarData.GiveDelegateRewardPercentage,
      is_reward_change: false,
      updated_at: GENESIS_TIMESTAMP,
    });

    console.log(`  ✓ Pillar created: ${pillarData.Name}`);
  }

  console.log('✓ Genesis pillars seeded successfully\n');
}
