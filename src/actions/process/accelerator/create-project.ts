import type { ActionContext, ActionHandler } from '../types.js';
import { slugify } from '../../../helpers/slugify.js';
import { refreshPillarEngagement } from '../../indexer/pillar-metrics.js';

export const createProject: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, frontierMomentum } = ctx;

  const name = decoded.name as string;
  const znnFundsNeeded = BigInt(decoded.znnFundsNeeded.toString());
  const qsrFundsNeeded = BigInt(decoded.qsrFundsNeeded.toString());

  await tx('nom_accelerator_projects').insert({
    owner_id: sendBlock.accountId,
    hash: sendBlock.hash,
    name,
    slug: slugify(name),
    url: decoded.url as string,
    description: decoded.description as string,
    status: 0,
    znn_requested: znnFundsNeeded,
    qsr_requested: qsrFundsNeeded,
    znn_remaining: znnFundsNeeded,
    qsr_remaining: qsrFundsNeeded,
    created_at: frontierMomentum.timestamp,
  });

  // A new or replaced item changes every pillar's engagement.
  await refreshPillarEngagement(tx);
};
