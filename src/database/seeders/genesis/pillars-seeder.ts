import { db } from '../../knex.js';
import { genesisPath } from '../../../config/genesis.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { DECIMALS } from '../../../constants/zenon.js';
import { genesisTimestamp, readGenesis } from './genesis-file.js';

interface GenesisPillar {
  Name: string;
  StakeAddress: string;
  BlockProducingAddress: string;
  RewardWithdrawAddress: string;
  GiveBlockRewardPercentage: number;
  GiveDelegateRewardPercentage: number;
}

interface GenesisData {
  GenesisTimestampSec: number;
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

  const genesisData = await readGenesis<GenesisData>();
  const createdAt = genesisTimestamp(genesisData);

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
        created_at: createdAt,
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
      updated_at: createdAt,
    });

    console.log(`  ✓ Pillar created: ${pillarData.Name}`);
  }

  console.log('✓ Genesis pillars seeded successfully\n');
}
