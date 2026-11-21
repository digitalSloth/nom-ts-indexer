import type { ActionContext, ActionHandler } from '../types.js';
import { markPillarRanksDirty } from '../../indexer/pillar-metrics.js';

export const revoke: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const pillar = await tx('nom_pillars').where({ name: decoded.name }).select('id').first();
  if (!pillar) {
    throw new Error(`Pillar.Revoke: pillar not found for ${decoded.name}`);
  }

  await tx('nom_pillars').where({ id: pillar.id }).update({
    revoked_at: receiveBlock.createdAt,
    weight: '0',
    produced_momentums: 0,
  });
  markPillarRanksDirty(tx);
};
