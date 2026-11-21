import type { ActionContext, ActionHandler } from '../types.js';

export const liquidityStake: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, frontierMomentum } = ctx;
  const duration = BigInt(decoded.durationInSec.toString());

  await tx('nom_stakes').insert({
    account_id: sendBlock.accountId,
    token_id: sendBlock.tokenId,
    account_block_id: sendBlock.id,
    amount: sendBlock.amount,
    duration,
    // The contract times the stake from its frontier momentum.
    started_at: frontierMomentum.timestamp,
    expires_at: new Date(frontierMomentum.timestamp.getTime() + Number(duration) * 1000),
  });
};
