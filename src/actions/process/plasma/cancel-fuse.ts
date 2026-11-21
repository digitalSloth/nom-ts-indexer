import type { ActionContext, ActionHandler } from '../types.js';

export const cancelFuse: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;
  const id = decoded.id.toString().replace(/^0x/, '');

  // The contract deletes a fusion when it is cancelled, so a successful
  // cancel always refers to an active fusion.
  const plasma = await tx('nom_plasma')
    .where({ hash: id })
    .whereNull('ended_at')
    .select('id')
    .first();
  if (!plasma) {
    throw new Error(`Plasma.CancelFuse: active fusion not found for ${id}`);
  }

  await tx('nom_plasma').where({ id: plasma.id }).update({ ended_at: receiveBlock.createdAt });
};
