import type { ActionContext, ActionHandler } from '../types.js';
import { insertAccountReward } from '../../indexer/insert-account-reward.js';
import { updateNetworkTotals } from './network.js';

// Unwraps above this log index are affiliate rewards, not Ethereum transfers.
const AFFILIATE_REWARD_MIN_LOG_INDEX = 4_000_000_000n;

export const redeem: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const unwrap = await tx('nom_bridge_unwraps')
    .where({
      transaction_hash: decoded.transactionHash as string,
      log_index: BigInt(decoded.logIndex),
    })
    .select('id', 'bridge_network_id', 'to_account_id', 'token_id', 'log_index', 'amount')
    .first();
  if (!unwrap) {
    throw new Error(
      `Bridge.Redeem: unwrap not found for ${decoded.transactionHash}/${decoded.logIndex}`,
    );
  }

  await tx('nom_bridge_unwraps')
    .where({ id: unwrap.id })
    .update({ redeemed_at: receiveBlock.createdAt, updated_at: receiveBlock.createdAt });

  // The bridge pays the unwrap out now, affiliate rewards included.
  await updateNetworkTotals(
    tx,
    unwrap.bridge_network_id,
    unwrap.token_id,
    'unwrapped',
    unwrap.amount,
    receiveBlock.createdAt,
  );

  if (BigInt(unwrap.log_index) > AFFILIATE_REWARD_MIN_LOG_INDEX) {
    await insertAccountReward(tx, {
      accountId: unwrap.to_account_id,
      tokenId: unwrap.token_id,
      accountBlockId: sendBlock.id,
      type: 'bridge_affiliate',
      amount: unwrap.amount,
      createdAt: receiveBlock.createdAt,
    });
  }
};
