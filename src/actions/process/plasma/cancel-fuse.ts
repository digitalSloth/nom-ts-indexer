import type { ActionContext, ActionHandler } from '../types.js';

export const cancelFuse: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  if (!decoded.id) {
    throw new Error('Plasma.CancelFuse: missing id');
  }

  const original = await tx('nom_account_blocks')
    .where({ hash: decoded.id.toString().replace(/^0x/, '') })
    .select('id')
    .first();
  if (!original) {
    console.warn(`Plasma.CancelFuse: original block ${decoded.id} not found, skipping`);
    return;
  }

  const plasma = await tx('nom_plasma')
    .where({ account_block_id: original.id, ended_at: null })
    .select('id', 'from_account_id', 'to_account_id', 'amount')
    .first();
  if (!plasma) {
    console.warn(`Plasma.CancelFuse: active plasma row for ${decoded.id} not found, skipping`);
    return;
  }

  await tx('nom_plasma').where({ id: plasma.id }).update({ ended_at: receiveBlock.createdAt });
};
