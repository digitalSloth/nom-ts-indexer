import type { ActionContext, ActionHandler } from '../types.js';

export const cancel: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  if (!decoded.id) {
    throw new Error('Stake.Cancel: missing id');
  }

  const original = await tx('nom_account_blocks')
    .where({ hash: decoded.id.toString().replace(/^0x/, '') })
    .select('id')
    .first();
  if (!original) {
    console.warn(`Stake.Cancel: original block ${decoded.id} not found, skipping`);
    return;
  }

  const stake = await tx('nom_stakes')
    .where({ account_block_id: original.id, ended_at: null })
    .select('id', 'account_id', 'amount')
    .first();
  if (!stake) {
    console.warn(`Stake.Cancel: active stake row for ${decoded.id} not found, skipping`);
    return;
  }

  await tx('nom_stakes').where({ id: stake.id }).update({ ended_at: receiveBlock.createdAt });
};
