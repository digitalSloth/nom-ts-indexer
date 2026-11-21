import type { ActionContext, ActionHandler } from '../types.js';
import { resolveVotable, upsertVote, recountVotes } from './vote-helpers.js';

export const voteByProdAddress: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const pillar = await tx('nom_pillars')
    .where({ producer_account_id: sendBlock.accountId })
    .whereNull('revoked_at')
    .select('id', 'owner_id')
    .first();
  if (!pillar) {
    throw new Error(
      `Accelerator.VoteByProdAddress: active pillar not found for producer account ${sendBlock.accountId}`,
    );
  }

  const resolved = await resolveVotable(tx, decoded.id as string);
  if (!resolved) {
    throw new Error(`Accelerator.VoteByProdAddress: votable item not found for hash ${decoded.id}`);
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
