import type { ActionContext, ActionHandler } from '../types.js';

export const liquidityStake: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (decoded.durationInSec === undefined || decoded.durationInSec === null) {
    throw new Error('Liquidity.LiquidityStake: missing durationInSec');
  }
  if (sendBlock.tokenId == null) {
    console.warn('Liquidity.LiquidityStake: send block has no token, skipping');
    return;
  }
  if (sendBlock.amount === '0') {
    console.warn('Liquidity.LiquidityStake: amount is zero, skipping');
    return;
  }

  const existing = await tx('nom_stakes')
    .where({ account_block_id: sendBlock.id })
    .select('id')
    .first();
  if (existing) {
    return;
  }

  // Liquidity stakes share the nom_stakes table. Unlike Stake.Stake, the
  // staked token is an LP token rather than ZNN, so no Account aggregate
  // (znn_staked) is updated here.
  await tx('nom_stakes')
    .insert({
      account_id: sendBlock.accountId,
      token_id: sendBlock.tokenId,
      account_block_id: sendBlock.id,
      amount: sendBlock.amount,
      duration: BigInt(decoded.durationInSec.toString()),
      started_at: receiveBlock.createdAt,
    })
    .returning('*');
};
