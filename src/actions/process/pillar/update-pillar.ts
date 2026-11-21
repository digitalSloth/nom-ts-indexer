import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { pillarRegistry } from '../../../services/registries/pillar-registry.js';

export const updatePillar: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const pillar = await tx('nom_pillars')
    .where({ name: decoded.name })
    .select(
      'id',
      'producer_account_id',
      'withdraw_account_id',
      'momentum_rewards',
      'delegate_rewards',
    )
    .first();
  if (!pillar) {
    throw new Error(`Pillar.UpdatePillar: pillar not found for ${decoded.name}`);
  }

  const producerAccountId = await accountRegistry.getOrCreate(
    tx,
    decoded.producerAddress.toString(),
  );
  const withdrawAccountId = await accountRegistry.getOrCreate(tx, decoded.rewardAddress.toString());
  const newMomentumRewards = Number(decoded.giveBlockRewardPercentage);
  const newDelegateRewards = Number(decoded.giveDelegateRewardPercentage);

  const changed =
    pillar.producer_account_id !== producerAccountId ||
    pillar.withdraw_account_id !== withdrawAccountId ||
    pillar.momentum_rewards !== newMomentumRewards ||
    pillar.delegate_rewards !== newDelegateRewards;

  // An update that changes nothing succeeds on chain and records no history.
  if (!changed) {
    return;
  }

  const isRewardChange =
    pillar.momentum_rewards !== newMomentumRewards ||
    pillar.delegate_rewards !== newDelegateRewards;

  await tx('nom_pillars').where({ id: pillar.id }).update({
    producer_account_id: producerAccountId,
    withdraw_account_id: withdrawAccountId,
    momentum_rewards: newMomentumRewards,
    delegate_rewards: newDelegateRewards,
    updated_at: receiveBlock.createdAt,
  });

  await tx('nom_pillar_update_histories').insert({
    pillar_id: pillar.id,
    producer_account_id: producerAccountId,
    withdraw_account_id: withdrawAccountId,
    momentum_rewards: newMomentumRewards,
    delegate_rewards: newDelegateRewards,
    is_reward_change: isRewardChange,
    updated_at: receiveBlock.createdAt,
  });

  // Producer rotated → make sure attribution from this momentum onward picks
  // up the new producer. We keep the old mapping too: it covers historical
  // momentums replayed during a re-index.
  if (pillar.producer_account_id !== producerAccountId) {
    pillarRegistry.setPillarId(producerAccountId, pillar.id);
  }
};
