import type { ActionContext, ActionHandler } from '../types.js';
import { requireHtlcId } from './require-htlc.js';

/** Returns an expired HTLC to its time-locked account. */
export const reclaim: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;
  const id = await requireHtlcId(tx, 'Reclaim', decoded.id);

  await tx('nom_htlcs').where({ id }).update({
    reclaim_account_block_id: sendBlock.id,
    reclaimed_at: receiveBlock.createdAt,
  });
};
