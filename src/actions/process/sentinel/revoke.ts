import type { ActionContext, ActionHandler } from '../types.js';

export const revoke: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  const sentinel = await tx('nom_sentinels')
    .where({ owner_id: sendBlock.accountId, revoked_at: null })
    .select('id')
    .first();
  if (!sentinel) {
    throw new Error(
      `Sentinel.Revoke: active sentinel not found for account ${sendBlock.accountId}`,
    );
  }

  await tx('nom_sentinels')
    .where({ id: sentinel.id })
    .update({ revoked_at: receiveBlock.createdAt });
};
