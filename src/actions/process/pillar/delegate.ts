import type { ActionContext, ActionHandler } from '../types.js';
import { addPillarWeight, znnBalance } from '../../indexer/pillar-metrics.js';

export const delegate: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const pillar = await tx('nom_pillars').where({ name: decoded.name }).select('id').first();
  if (!pillar) {
    throw new Error(`Pillar.Delegate: pillar not found for ${decoded.name}`);
  }

  const active = await tx('nom_delegations')
    .where({ account_id: sendBlock.accountId, ended_at: null })
    .select('id', 'pillar_id')
    .first();

  // Delegating to the current pillar succeeds on chain and changes nothing.
  if (active && active.pillar_id === pillar.id) {
    return;
  }

  // The delegator's whole ZNN balance moves to the new pillar's weight.
  const balance = await znnBalance(tx, sendBlock.accountId);

  if (active) {
    await tx('nom_delegations')
      .where({ id: active.id })
      .update({ ended_at: receiveBlock.createdAt });
    await addPillarWeight(tx, active.pillar_id, -balance);
  }

  await tx('nom_delegations').insert({
    pillar_id: pillar.id,
    account_id: sendBlock.accountId,
    started_at: receiveBlock.createdAt,
  });
  await addPillarWeight(tx, pillar.id, balance);
};
