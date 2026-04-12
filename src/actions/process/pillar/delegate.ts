import type { ActionContext, ActionHandler } from '../types.js';

export const delegate: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (typeof decoded.name !== 'string' || decoded.name.length === 0) {
    throw new Error('Pillar.Delegate: name is empty');
  }

  const pillar = await tx('nom_pillars')
    .where({ name: decoded.name })
    .select('id', 'revoked_at')
    .first();

  if (!pillar) {
    console.warn(`Pillar.Delegate: pillar "${decoded.name}" not found, skipping`);
    return;
  }
  if (pillar.revoked_at && receiveBlock.createdAt > pillar.revoked_at) {
    console.warn(`Pillar.Delegate: pillar is revoked, skipping`);
    return;
  }

  const active = await tx('nom_delegations')
    .where({ account_id: sendBlock.accountId, ended_at: null })
    .select('id', 'pillar_id')
    .first();

  if (active && active.pillar_id === pillar.id) {
    return;
  }

  if (active) {
    await tx('nom_delegations')
      .where({ id: active.id })
      .update({ ended_at: receiveBlock.createdAt });
  }

  await tx('nom_delegations').insert({
    pillar_id: pillar.id,
    account_id: sendBlock.accountId,
    started_at: receiveBlock.createdAt,
  });
};
