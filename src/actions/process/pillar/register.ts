import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { pillarRegistry } from '../../../services/registries/pillar-registry.js';
import {
  PILLAR_QSR_STAKE_BASE_AMOUNT,
  PILLAR_QSR_STAKE_INCREASE_AMOUNT,
} from '../../../constants/zenon.js';
import { slugify } from '../../../helpers/slugify.js';
import { consumeQsrDeposit } from './qsr-deposit.js';
import { markPillarRanksDirty } from '../../indexer/pillar-metrics.js';

export const register: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const name = decoded.name as string;
  const producerAddress = decoded.producerAddress.toString();
  const rewardAddress = decoded.rewardAddress.toString();

  const producerAccountId = await accountRegistry.getOrCreate(tx, producerAddress);
  const withdrawAccountId = await accountRegistry.getOrCreate(tx, rewardAddress);

  // The contract prices the next pillar by the number of active, non-legacy pillars.
  const countRow = await tx('nom_pillars')
    .where({ is_legacy: false, revoked_at: null })
    .count('* as c')
    .first();
  const normalCount = Number(countRow?.c ?? 0);
  const qsrBurn =
    PILLAR_QSR_STAKE_BASE_AMOUNT + PILLAR_QSR_STAKE_INCREASE_AMOUNT * BigInt(normalCount);

  const [pillar] = await tx('nom_pillars')
    .insert({
      owner_id: sendBlock.accountId,
      producer_account_id: producerAccountId,
      withdraw_account_id: withdrawAccountId,
      name,
      slug: slugify(name),
      qsr_burn: qsrBurn,
      momentum_rewards: Number(decoded.giveBlockRewardPercentage),
      delegate_rewards: Number(decoded.giveDelegateRewardPercentage),
      is_legacy: false,
      created_at: receiveBlock.createdAt,
    })
    .returning('id');

  pillarRegistry.setPillarId(producerAccountId, pillar.id);
  markPillarRanksDirty(tx);

  await consumeQsrDeposit(ctx, 'Pillar.Register', qsrBurn);
};
