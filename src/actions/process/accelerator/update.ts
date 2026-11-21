import type { ActionContext, ActionHandler } from '../types.js';
import { AcceleratorProjectStatus } from 'znn-typescript-sdk';
import {
  ACCELERATOR_PROJECT_VOTING_PERIOD,
  ACCELERATOR_VOTE_ACCEPTANCE_THRESHOLD,
} from '../../../constants/zenon.js';

export interface VotableItem {
  total_votes: number;
  total_yes_votes: number;
  total_no_votes: number;
}

export function isQuorumReached(item: VotableItem, numPillars: number): boolean {
  if (item.total_yes_votes <= item.total_no_votes) return false;
  if (item.total_votes * 100 <= numPillars * ACCELERATOR_VOTE_ACCEPTANCE_THRESHOLD) return false;
  return true;
}

export function isVotingOpen(createdAt: Date, now: Date): boolean {
  const createdSec = Math.floor(createdAt.getTime() / 1000);
  const nowSec = Math.floor(now.getTime() / 1000);
  return createdSec + ACCELERATOR_PROJECT_VOTING_PERIOD >= nowSec;
}

/**
 * The contract pays a phase with a ZNN send and a QSR send from this receive,
 * each carrying the phase id as data. It skips phases it cannot fund and caps
 * the payouts per update, so the paid phases are read from those sends.
 */
async function paidPhaseHashes(tx: any, receiveBlockId: number): Promise<string[]> {
  const rows = await tx('nom_account_blocks as ab')
    .join('nom_account_block_data as d', 'd.account_block_id', 'ab.id')
    .where('ab.parent_id', receiveBlockId)
    .select('d.raw');
  const hashes = rows.map((r: any) => Buffer.from(r.raw, 'base64').toString('hex'));
  return [...new Set<string>(hashes)];
}

export const update: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, receiveBlock, frontierMomentum } = ctx;
  const now = frontierMomentum.timestamp;

  const [votingProjects, numPillarsRow] = await Promise.all([
    tx('nom_accelerator_projects').where({ status: AcceleratorProjectStatus.voting }),
    tx('nom_pillars').whereNull('revoked_at').count('* as c').first(),
  ]);
  const numPillars = Number(numPillarsRow?.c ?? 0);

  // A project passes only while its voting period is open. Once the period
  // ends it closes, whatever its votes.
  for (const project of votingProjects) {
    let status: number | null = null;
    if (!isVotingOpen(project.created_at, now)) {
      status = AcceleratorProjectStatus.closed;
    } else if (isQuorumReached(project, numPillars)) {
      status = AcceleratorProjectStatus.active;
    }
    if (status !== null) {
      await tx('nom_accelerator_projects')
        .where({ id: project.id })
        .update({
          status,
          ...(status === AcceleratorProjectStatus.active ? { accepted_at: now } : {}),
          updated_at: receiveBlock.createdAt,
        });
    }
  }

  for (const hash of await paidPhaseHashes(tx, receiveBlock.id)) {
    const phase = await tx('nom_accelerator_phases')
      .where({ hash })
      .select('id', 'project_id', 'znn_requested', 'qsr_requested')
      .first();
    if (!phase) {
      throw new Error(`Accelerator.Update: phase not found for paid hash ${hash}`);
    }
    const project = await tx('nom_accelerator_projects')
      .where({ id: phase.project_id })
      .select('id', 'status', 'znn_paid', 'qsr_paid', 'znn_remaining', 'qsr_remaining')
      .first();
    if (!project) {
      throw new Error(`Accelerator.Update: project not found for phase ${hash}`);
    }

    await tx('nom_accelerator_phases').where({ id: phase.id }).update({
      status: AcceleratorProjectStatus.paid,
      accepted_at: now,
      updated_at: receiveBlock.createdAt,
    });

    // bigint columns arrive from Postgres as strings
    const znnRemaining = BigInt(project.znn_remaining) - BigInt(phase.znn_requested);
    const qsrRemaining = BigInt(project.qsr_remaining) - BigInt(phase.qsr_requested);
    const isComplete = znnRemaining === 0n && qsrRemaining === 0n;

    await tx('nom_accelerator_projects')
      .where({ id: project.id })
      .update({
        znn_paid: (BigInt(project.znn_paid) + BigInt(phase.znn_requested)).toString(),
        qsr_paid: (BigInt(project.qsr_paid) + BigInt(phase.qsr_requested)).toString(),
        znn_remaining: znnRemaining.toString(),
        qsr_remaining: qsrRemaining.toString(),
        status: isComplete ? AcceleratorProjectStatus.completed : project.status,
        updated_at: receiveBlock.createdAt,
      });
  }
};
