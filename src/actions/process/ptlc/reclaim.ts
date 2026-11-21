import type { ActionContext, ActionHandler } from '../types.js';
import { bareHex } from '../htlc/hex.js';
import { requirePtlcId } from './require-ptlc.js';

/** Returns an expired PTLC to its time-locked account. */
function reclaimPtlc(methodName: string, withSignature = false): ActionHandler {
  return async (ctx: ActionContext): Promise<void> => {
    const { tx, decoded, sendBlock, receiveBlock } = ctx;
    const id = await requirePtlcId(tx, methodName, decoded.id);

    await tx('nom_ptlcs')
      .where({ id })
      .update({
        reclaim_account_block_id: sendBlock.id,
        reclaimed_at: receiveBlock.createdAt,
        ...(withSignature && { reclaim_signature: bareHex(decoded.signature) }),
      });
  };
}

export const reclaim = reclaimPtlc('Reclaim');
export const reclaimWithSignature = reclaimPtlc('ReclaimWithSignature', true);
