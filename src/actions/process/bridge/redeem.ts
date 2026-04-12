import type { ActionContext, ActionHandler } from '../types.js';

export const redeem: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  if (!decoded.transactionHash || decoded.logIndex === undefined) {
    throw new Error('Bridge.Redeem: missing required fields');
  }

  const unwrap = await tx('nom_bridge_unwraps')
    .where({
      transaction_hash: decoded.transactionHash as string,
      log_index: BigInt(decoded.logIndex),
    })
    .whereNull('redeemed_at')
    .whereNull('revoked_at')
    .select('id')
    .first();
  if (!unwrap) {
    console.warn('Bridge.Redeem: unredeemed unwrap not found');
    return;
  }

  await tx('nom_bridge_unwraps')
    .where({ id: unwrap.id })
    .update({ redeemed_at: receiveBlock.createdAt });
};
