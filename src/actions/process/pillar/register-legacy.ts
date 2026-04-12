import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { pillarRegistry } from '../../../services/registries/pillar-registry.js';
import { PILLAR_QSR_STAKE_BASE_AMOUNT } from '../../../constants/zenon.js';
import { slugify } from '../../../helpers/slugify.js';

export const registerLegacy: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (typeof decoded.name !== 'string' || decoded.name.length === 0) {
    throw new Error('Pillar.RegisterLegacy: name is empty');
  }
  if (!decoded.producerAddress || !decoded.rewardAddress) {
    throw new Error('Pillar.RegisterLegacy: missing producer/reward address');
  }

  const name = decoded.name as string;
  const producerAccountId = await accountRegistry.getOrCreate(
    tx,
    decoded.producerAddress.toString(),
  );
  const withdrawAccountId = await accountRegistry.getOrCreate(tx, decoded.rewardAddress.toString());

  const [pillar] = await tx('nom_pillars')
    .insert({
      owner_id: sendBlock.accountId,
      producer_account_id: producerAccountId,
      withdraw_account_id: withdrawAccountId,
      name,
      slug: slugify(name),
      qsr_burn: PILLAR_QSR_STAKE_BASE_AMOUNT,
      momentum_rewards: Number(decoded.giveBlockRewardPercentage ?? 0),
      delegate_rewards: Number(decoded.giveDelegateRewardPercentage ?? 0),
      is_legacy: true,
      created_at: receiveBlock.createdAt,
    })
    .returning('id');

  pillarRegistry.setPillarId(producerAccountId, pillar.id);
};
