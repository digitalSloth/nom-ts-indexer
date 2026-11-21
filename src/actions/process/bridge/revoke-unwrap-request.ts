import type { ActionContext, ActionHandler } from '../types.js';

export const revokeUnwrapRequest: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const unwrap = await tx('nom_bridge_unwraps')
    .where({
      transaction_hash: decoded.transactionHash as string,
      log_index: BigInt(decoded.logIndex),
    })
    .select('id')
    .first();
  if (!unwrap) {
    throw new Error(
      `Bridge.RevokeUnwrapRequest: unwrap not found for ${decoded.transactionHash}/${decoded.logIndex}`,
    );
  }

  await tx('nom_bridge_unwraps')
    .where({ id: unwrap.id })
    .update({ revoked_at: receiveBlock.createdAt, updated_at: receiveBlock.createdAt });

  // The network totals count an unwrap when it is redeemed, so a revoke
  // changes none: an unredeemed request can no longer be redeemed, and
  // the contract also accepts revoking a request already redeemed.
};
