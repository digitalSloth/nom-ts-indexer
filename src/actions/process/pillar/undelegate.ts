import type { ActionContext, ActionHandler } from '../types.js';
import { addPillarWeight, znnBalance } from '../../indexer/pillar-metrics.js';

export const undelegate: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  const active = await tx('nom_delegations')
    .where({ account_id: sendBlock.accountId, ended_at: null })
    .select('id', 'pillar_id')
    .first();
  if (!active) {
    throw new Error(`Pillar.Undelegate: delegation not found for account ${sendBlock.accountId}`);
  }

  await tx('nom_delegations').where({ id: active.id }).update({ ended_at: receiveBlock.createdAt });
  await addPillarWeight(tx, active.pillar_id, -(await znnBalance(tx, sendBlock.accountId)));
};
