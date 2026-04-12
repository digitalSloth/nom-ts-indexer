import type { ActionContext, ActionHandler } from '../types.js';
import { validateProjectParams } from './validate.js';
import { slugify } from '../../../helpers/slugify.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';

function assertPhaseParams(decoded: Record<string, any>): void {
  assertRequiredFields(
    decoded,
    ['id', 'name', 'description', 'url', 'znnFundsNeeded', 'qsrFundsNeeded'],
    'Accelerator.AddPhase',
  );
  validateProjectParams(decoded);
}

export const addPhase: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertPhaseParams(decoded);

  const projectHash = decoded.id as string;
  const name = decoded.name as string;
  const znnFundsNeeded = BigInt(decoded.znnFundsNeeded.toString());
  const qsrFundsNeeded = BigInt(decoded.qsrFundsNeeded.toString());

  const project = await tx('nom_accelerator_projects')
    .where({ hash: projectHash })
    .select('id', 'owner_id', 'status')
    .first();
  if (!project) {
    console.warn(`Accelerator.AddPhase: project not found for hash ${projectHash}`);
    return;
  }

  if (project.owner_id !== sendBlock.accountId) {
    console.warn('Accelerator.AddPhase: sender is not project owner');
    return;
  }

  if (project.status !== 1) {
    console.warn('Accelerator.AddPhase: project is not active');
    return;
  }

  const latestPhase = await tx('nom_accelerator_phases')
    .where({ project_id: project.id })
    .orderBy('phase_number', 'desc')
    .select('id', 'status', 'phase_number')
    .first();

  if (latestPhase && latestPhase.status !== 2) {
    console.warn('Accelerator.AddPhase: latest phase is not paid');
    return;
  }

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
    created_at: receiveBlock.createdAt,
  });

  await tx('nom_accelerator_projects')
    .where({ id: project.id })
    .update({ updated_at: receiveBlock.createdAt });
};
