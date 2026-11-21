import type { ActionContext, ActionHandler } from '../types.js';

/**
 * UnlockLiquidityStakeEntries: every liquidity stake of the token sent with
 * the call that has not expired yet expires now, so it can be cancelled.
 */
export const unlockLiquidityStakeEntries: ActionHandler = async (
  ctx: ActionContext,
): Promise<void> => {
  const { tx, sendBlock, frontierMomentum } = ctx;
  const now = frontierMomentum.timestamp;

  // nom_stakes also holds Stake contract entries, so match the stakes sent
  // to the liquidity contract, which received this call.
  await tx('nom_stakes')
    .where({ token_id: sendBlock.tokenId })
    .where('expires_at', '>', now)
    .whereIn(
      'account_block_id',
      tx('nom_account_blocks').select('id').where({ to_account_id: sendBlock.toAccountId }),
    )
    .update({ expires_at: now });
};
