import type { ActionContext, ActionHandler } from '../types.js';

export const updateWrapRequest: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  // The request id is the hash of the WrapToken send block.
  const blockHash = (decoded.id as string).replace(/^0x/, '');
  const wrap = await tx('nom_bridge_wraps')
    .join('nom_account_blocks', 'nom_bridge_wraps.account_block_id', 'nom_account_blocks.id')
    .where({ 'nom_account_blocks.hash': blockHash })
    .select('nom_bridge_wraps.id')
    .first();
  if (!wrap) {
    throw new Error(`Bridge.UpdateWrapRequest: wrap not found for ${blockHash}`);
  }

  await tx('nom_bridge_wraps')
    .where({ id: wrap.id })
    .update({
      signature: decoded.signature as string,
      updated_at: receiveBlock.createdAt,
    });
};
