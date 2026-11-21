import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { pillarRegistry } from '../../../services/registries/pillar-registry.js';
import { PILLAR_QSR_STAKE_BASE_AMOUNT } from '../../../constants/zenon.js';
import { slugify } from '../../../helpers/slugify.js';
import { consumeQsrDeposit } from './qsr-deposit.js';
import { markPillarRanksDirty } from '../../indexer/pillar-metrics.js';
import { swapKeyIdHash } from '../swap/key-id-hash.js';

export const registerLegacy: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

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
      momentum_rewards: Number(decoded.giveBlockRewardPercentage),
      delegate_rewards: Number(decoded.giveDelegateRewardPercentage),
      is_legacy: true,
      created_at: receiveBlock.createdAt,
    })
    .returning('id');

  pillarRegistry.setPillarId(producerAccountId, pillar.id);
  markPillarRanksDirty(tx);

  await consumeQsrDeposit(ctx, 'Pillar.RegisterLegacy', PILLAR_QSR_STAKE_BASE_AMOUNT);

  // The legacy key used to register gives up one of its genesis pillar slots.
  const keyIdHash = swapKeyIdHash(decoded.publicKey as string);
  const entry = await tx('nom_legacy_pillar_entries')
    .where({ key_id_hash: keyIdHash })
    .select('id', 'remaining_count')
    .first();
  if (!entry) {
    throw new Error(`Pillar.RegisterLegacy: legacy pillar entry not found for ${keyIdHash}`);
  }
  await tx('nom_legacy_pillar_entries')
    .where({ id: entry.id })
    .update({ remaining_count: entry.remaining_count - 1 });
};
