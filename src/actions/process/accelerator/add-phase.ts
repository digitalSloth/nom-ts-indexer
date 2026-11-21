import type { ActionContext, ActionHandler } from '../types.js';
import { slugify } from '../../../helpers/slugify.js';
import { refreshPillarEngagement } from '../../indexer/pillar-metrics.js';
import { bareHex } from '../htlc/hex.js';

export const addPhase: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock, frontierMomentum } = ctx;

  const projectHash = bareHex(decoded.id);
  const name = decoded.name as string;
  const znnFundsNeeded = BigInt(decoded.znnFundsNeeded.toString());
  const qsrFundsNeeded = BigInt(decoded.qsrFundsNeeded.toString());

  const project = await tx('nom_accelerator_projects')
    .where({ hash: projectHash })
    .select('id')
    .first();
  if (!project) {
    throw new Error(`Accelerator.AddPhase: project not found for hash ${projectHash}`);
  }

  const latestPhase = await tx('nom_accelerator_phases')
    .where({ project_id: project.id })
    .orderBy('phase_number', 'desc')
    .select('phase_number')
    .first();
  const nextPhaseNumber = latestPhase ? latestPhase.phase_number + 1 : 1;

  await tx('nom_accelerator_phases').insert({
    project_id: project.id,
    hash: sendBlock.hash,
    name,
    slug: slugify(name),
    url: decoded.url as string,
    description: decoded.description as string,
    status: 0,
    phase_number: nextPhaseNumber,
    znn_requested: znnFundsNeeded,
    qsr_requested: qsrFundsNeeded,
    created_at: frontierMomentum.timestamp,
  });

  await tx('nom_accelerator_projects')
    .where({ id: project.id })
    .update({ updated_at: receiveBlock.createdAt });

  // A new or replaced item changes every pillar's engagement.
  await refreshPillarEngagement(tx);
};
