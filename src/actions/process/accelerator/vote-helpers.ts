import { AcceleratorProjectVote } from 'znn-typescript-sdk';
import { bareHex } from '../htlc/hex.js';
import { refreshPillarEngagement } from '../../indexer/pillar-metrics.js';

/**
 * Resolves a votable item by hash, trying project first then phase.
 * Accepts the decoded 0x-prefixed hash. Returns { votableType, votable }
 * or null if not found.
 */
export async function resolveVotable(
  tx: any,
  itemHash: string,
): Promise<{ votableType: string; votable: { id: number } } | null> {
  const hash = bareHex(itemHash);
  let votableType = 'AcceleratorProject';
  let votable = await tx('nom_accelerator_projects').where({ hash }).select('id').first();
  if (!votable) {
    votableType = 'AcceleratorPhase';
    votable = await tx('nom_accelerator_phases').where({ hash }).select('id').first();
  }
  if (!votable) return null;
  return { votableType, votable };
}

/**
 * Upserts a vote: updates if one exists for this pillar+votable, creates
 * otherwise. Then recomputes the pillar's engagement.
 */
export async function upsertVote(
  tx: any,
  params: {
    ownerId: number;
    pillarId: number;
    votableType: string;
    votableId: number;
    voteValue: number;
    createdAt: Date;
  },
): Promise<void> {
  const { ownerId, pillarId, votableType, votableId, voteValue, createdAt } = params;

  const existingVote = await tx('nom_votes')
    .where({ pillar_id: pillarId, votable_type: votableType, votable_id: votableId })
    .select('id')
    .first();

  if (existingVote) {
    await tx('nom_votes')
      .where({ id: existingVote.id })
      .update({ vote: voteValue, created_at: createdAt });
  } else {
    await tx('nom_votes').insert({
      owner_id: ownerId,
      pillar_id: pillarId,
      votable_type: votableType,
      votable_id: votableId,
      vote: voteValue,
      created_at: createdAt,
    });
  }

  await refreshPillarEngagement(tx, [pillarId]);
}

/**
 * Recounts all votes for a votable item and updates its aggregate totals.
 */
export async function recountVotes(
  tx: any,
  votableType: string,
  votableId: number,
  updatedAt: Date,
): Promise<void> {
  const votes = await tx('nom_votes')
    .where({ votable_type: votableType, votable_id: votableId })
    .select('vote');

  const totalVotes = votes.length;
  const totalYesVotes = votes.filter((v: any) => v.vote === AcceleratorProjectVote.yes).length;
  const totalNoVotes = votes.filter((v: any) => v.vote === AcceleratorProjectVote.no).length;
  const totalAbstainVotes = votes.filter(
    (v: any) => v.vote === AcceleratorProjectVote.abstain,
  ).length;

  const updateData = {
    total_votes: totalVotes,
    total_yes_votes: totalYesVotes,
    total_no_votes: totalNoVotes,
    total_abstain_votes: totalAbstainVotes,
    updated_at: updatedAt,
  };

  if (votableType === 'AcceleratorProject') {
    await tx('nom_accelerator_projects').where({ id: votableId }).update(updateData);
  } else {
    await tx('nom_accelerator_phases').where({ id: votableId }).update(updateData);
  }
}
