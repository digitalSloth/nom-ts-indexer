import type { ActionContext, ActionHandler } from '../types.js';
import { bareHex } from './hex.js';
import { requireHtlcId } from './require-htlc.js';

/** Pays the HTLC to its hash-locked account and reveals the preimage. */
export const unlock: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;
  const id = await requireHtlcId(tx, 'Unlock', decoded.id);

  await tx('nom_htlcs')
    .where({ id })
    .update({
      preimage: bareHex(decoded.preimage),
      unlock_account_block_id: sendBlock.id,
      unlocked_at: receiveBlock.createdAt,
    });
};
