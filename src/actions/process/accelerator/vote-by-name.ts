import type { ActionContext, ActionHandler } from '../types.js';
import { assertRequiredFields } from '../../../helpers/assert-required.js';
import { resolveVotable, upsertVote, recountVotes } from './vote-helpers.js';

export const voteByName: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  assertRequiredFields(decoded, ['id', 'name', 'vote'], 'Accelerator.VoteByName');

  const pillar = await tx('nom_pillars')
    .where({ name: decoded.name })
    .select('id', 'owner_id')
    .first();
  if (!pillar) {
    console.warn(`Accelerator.VoteByName: pillar "${decoded.name}" not found`);
    return;
  }

  if (pillar.owner_id !== sendBlock.accountId) {
    console.warn('Accelerator.VoteByName: sender is not pillar owner');
    return;
  }

  const resolved = await resolveVotable(tx, decoded.id as string);
  if (!resolved) {
    console.warn(`Accelerator.VoteByName: votable item not found for hash ${decoded.id}`);
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
