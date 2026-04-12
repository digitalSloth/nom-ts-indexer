import type { ActionContext, ActionHandler } from '../types.js';

export const register: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  const existing = await tx('nom_sentinels')
    .where({ owner_id: sendBlock.accountId, revoked_at: null })
    .select('id')
    .first();
  if (existing) {
    return;
  }

  await tx('nom_sentinels')
    .insert({
      owner_id: sendBlock.accountId,
      created_at: receiveBlock.createdAt,
    })
    .returning('*');
};
