import type { ActionContext, ActionHandler } from '../types.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';
import { resolveVotable, upsertVote, recountVotes } from './vote-helpers.js';

export const voteByProdAddress: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertRequiredFields(decoded, ['id', 'vote'], 'Accelerator.VoteByProdAddress');

  const pillar = await tx('nom_pillars')
    .where({ producer_account_id: sendBlock.accountId })
    .select('id', 'owner_id')
    .first();
  if (!pillar) {
    console.warn('Accelerator.VoteByProdAddress: pillar not found for producer address');
    return;
  }

  const resolved = await resolveVotable(tx, decoded.id as string);
  if (!resolved) {
    console.warn(`Accelerator.VoteByProdAddress: votable item not found for hash ${decoded.id}`);
    return;
  }

  await upsertVote(tx, {
    ownerId: pillar.owner_id,
    pillarId: pillar.id,
    votableType: resolved.votableType,
    votableId: resolved.votable.id,
    voteValue: Number(decoded.vote),
    createdAt: receiveBlock.createdAt,
  });

  await recountVotes(tx, resolved.votableType, resolved.votable.id, receiveBlock.createdAt);
};
