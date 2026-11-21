import type { ActionContext, ActionHandler } from '../types.js';

export const cancelLiquidityStake: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;
  const id = decoded.id.toString().replace(/^0x/, '');

  const stake = await tx('nom_stakes as s')
    .innerJoin('nom_account_blocks as ab', 'ab.id', 's.account_block_id')
    .where('ab.hash', id)
    .select('s.id', 's.ended_at')
    .first();
  if (!stake) {
    throw new Error(`Liquidity.CancelLiquidityStake: stake not found for ${id}`);
  }

  // The contract keeps a cancelled entry with a zero amount, so cancelling
  // it again succeeds and changes nothing.
  if (stake.ended_at) {
    return;
  }

  await tx('nom_stakes').where({ id: stake.id }).update({ ended_at: receiveBlock.createdAt });
};
