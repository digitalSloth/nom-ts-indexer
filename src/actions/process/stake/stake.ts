import type { ActionContext, ActionHandler } from '../types.js';

export const stake: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (decoded.durationInSec === undefined || decoded.durationInSec === null) {
    throw new Error('Stake.Stake: missing durationInSec');
  }
  if (sendBlock.tokenId == null) {
    console.warn('Stake.Stake: send block has no token, skipping');
    return;
  }
  if (sendBlock.amount === '0') {
    console.warn('Stake.Stake: amount is zero, skipping');
    return;
  }

  const existing = await tx('nom_stakes')
    .where({ account_block_id: sendBlock.id })
    .select('id')
    .first();
  if (existing) {
    return;
  }

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
