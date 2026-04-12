import type { ActionContext, ActionHandler } from '../types.js';
import { validateProjectParams } from './validate.js';
import { slugify } from '../../../helpers/slugify.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';

function assertProjectParams(decoded: Record<string, any>): void {
  assertRequiredFields(
    decoded,
    ['name', 'description', 'url', 'znnFundsNeeded', 'qsrFundsNeeded'],
    'Accelerator.CreateProject',
  );
  validateProjectParams(decoded);
}

export const createProject: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertProjectParams(decoded);

  const name = decoded.name as string;
  const znnFundsNeeded = BigInt(decoded.znnFundsNeeded.toString());
  const qsrFundsNeeded = BigInt(decoded.qsrFundsNeeded.toString());

  const existing = await tx('nom_accelerator_projects')
    .where({ hash: sendBlock.hash })
    .select('id')
    .first();
  if (existing) {
    return;
  }

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
    created_at: receiveBlock.createdAt,
  });
};
