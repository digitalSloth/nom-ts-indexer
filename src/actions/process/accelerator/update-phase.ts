import type { ActionContext, ActionHandler } from '../types.js';
import { validateProjectParams } from './validate.js';
import { slugify } from '../../../helpers/slugify.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';

function assertUpdatePhaseParams(decoded: Record<string, any>): void {
  assertRequiredFields(
    decoded,
    ['id', 'name', 'description', 'url', 'znnFundsNeeded', 'qsrFundsNeeded'],
    'Accelerator.UpdatePhase',
  );
  validateProjectParams(decoded);
}

export const updatePhase: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertUpdatePhaseParams(decoded);

  const projectHash = decoded.id as string;
  const name = decoded.name as string;
  const znnFundsNeeded = BigInt(decoded.znnFundsNeeded.toString());
  const qsrFundsNeeded = BigInt(decoded.qsrFundsNeeded.toString());

  const project = await tx('nom_accelerator_projects')
    .where({ hash: projectHash })
    .select('id', 'owner_id')
    .first();
  if (!project) {
    console.warn(`Accelerator.UpdatePhase: project not found for hash ${projectHash}`);
    return;
  }

  if (project.owner_id !== sendBlock.accountId) {
    console.warn('Accelerator.UpdatePhase: sender is not project owner');
    return;
  }

  const currentPhase = await tx('nom_accelerator_phases')
    .where({ project_id: project.id })
    .orderBy('phase_number', 'desc')
    .select('id', 'status')
    .first();
  if (!currentPhase) {
    console.warn('Accelerator.UpdatePhase: no phase found');
    return;
  }
  if (currentPhase.status !== 0) {
    console.warn('Accelerator.UpdatePhase: phase is not in voting status');
    return;
  }

  const znnPrice = null;
  const qsrPrice = null;

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
      znn_price: znnPrice,
      qsr_price: qsrPrice,
      updated_at: receiveBlock.createdAt,
    });

  // Delete existing votes for this phase
  await tx('nom_votes')
    .where({
      votable_type: 'AcceleratorPhase',
      votable_id: currentPhase.id,
    })
    .del();

  // Reset vote counts
  await tx('nom_accelerator_phases').where({ id: currentPhase.id }).update({
    total_votes: 0,
    total_yes_votes: 0,
    total_no_votes: 0,
    total_abstain_votes: 0,
  });

  await tx('nom_accelerator_projects')
    .where({ id: project.id })
    .update({ updated_at: receiveBlock.createdAt });
};
