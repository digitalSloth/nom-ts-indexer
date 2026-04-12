import type { ActionContext, ActionHandler } from '../types.js';

export const revoke: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (typeof decoded.name !== 'string' || decoded.name.length === 0) {
    throw new Error('Pillar.Revoke: name is empty');
  }

  const pillar = await tx('nom_pillars')
    .where({ name: decoded.name })
    .select('id', 'owner_id', 'revoked_at')
    .first();

  if (!pillar) {
    console.warn(`Pillar.Revoke: pillar "${decoded.name}" not found, skipping`);
    return;
  }
  if (pillar.owner_id !== sendBlock.accountId) {
    console.warn(`Pillar.Revoke: sender is not pillar owner, skipping`);
    return;
  }
  if (pillar.revoked_at) {
    return;
  }

  await tx('nom_pillars').where({ id: pillar.id }).update({
    revoked_at: receiveBlock.createdAt,
    weight: '0',
    produced_momentums: 0,
    expected_momentums: 0,
    missed_momentums: 0,
  });
};
