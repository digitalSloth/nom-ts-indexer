import type { ActionContext, ActionHandler } from '../types.js';

export const updateWrapRequest: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.id || !decoded.signature) {
    throw new Error('Bridge.UpdateWrapRequest: missing required fields');
  }

  // Find wrap by the associated account block's hash
  const wrap = await tx('nom_bridge_wraps')
    .join('nom_account_blocks', 'nom_bridge_wraps.account_block_id', 'nom_account_blocks.id')
    .where({ 'nom_account_blocks.hash': decoded.id as string })
    .select('nom_bridge_wraps.id')
    .first();
  if (!wrap) {
    console.warn('Bridge.UpdateWrapRequest: wrap request not found');
    return;
  }

  await tx('nom_bridge_wraps')
    .where({ id: wrap.id })
    .update({
      signature: decoded.signature as string,
      updated_at: receiveBlock.createdAt,
    });
};
