import type { ActionContext, ActionHandler } from '../types.js';
import { slugify } from '../../../helpers/slugify.js';
import { refreshPillarEngagement } from '../../indexer/pillar-metrics.js';
import { bareHex } from '../htlc/hex.js';

/**
 * Replaces the project's current phase with a new one. The contract gives the
 * replacement the update's hash and creation time, and deletes the old
 * phase's votes.
 */
export const updatePhase: ActionHandler = async (ctx: ActionContext): Promise<void> => {
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
    throw new Error(`Accelerator.UpdatePhase: project not found for hash ${projectHash}`);
  }

  const currentPhase = await tx('nom_accelerator_phases')
    .where({ project_id: project.id })
    .orderBy('phase_number', 'desc')
    .select('id')
    .first();
  if (!currentPhase) {
    throw new Error(`Accelerator.UpdatePhase: phase not found for project ${projectHash}`);
  }

  await tx('nom_accelerator_phases')
    .where({ id: currentPhase.id })
    .update({
      hash: sendBlock.hash,
      name,
      slug: slugify(name),
      url: decoded.url as string,
      description: decoded.description as string,
      znn_requested: znnFundsNeeded,
      qsr_requested: qsrFundsNeeded,
      total_votes: 0,
      total_yes_votes: 0,
      total_no_votes: 0,
      total_abstain_votes: 0,
      created_at: frontierMomentum.timestamp,
      updated_at: receiveBlock.createdAt,
    });

  await tx('nom_votes')
    .where({
      votable_type: 'AcceleratorPhase',
      votable_id: currentPhase.id,
    })
    .del();

  await tx('nom_accelerator_projects')
    .where({ id: project.id })
    .update({ updated_at: receiveBlock.createdAt });

  // A new or replaced item changes every pillar's engagement.
  await refreshPillarEngagement(tx);
};
