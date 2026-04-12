import type { ActionContext, ActionHandler } from '../types.js';
import { AcceleratorProjectStatus } from 'znn-typescript-sdk';
import {
  ACCELERATOR_PROJECT_VOTING_PERIOD,
  ACCELERATOR_VOTE_ACCEPTANCE_THRESHOLD,
} from '../../../constants/zenon.js';

interface VotableItem {
  id: number;
  total_votes: number;
  total_yes_votes: number;
  total_no_votes: number;
  total_abstain_votes: number;
}

function isQuorumReached(item: VotableItem, numPillars: number): boolean {
  if (item.total_yes_votes <= item.total_no_votes) return false;
  if (item.total_votes * 100 <= numPillars * ACCELERATOR_VOTE_ACCEPTANCE_THRESHOLD) return false;
  return true;
}

function isVotingOpen(createdAt: Date, now: Date): boolean {
  const createdSec = Math.floor(createdAt.getTime() / 1000);
  const nowSec = Math.floor(now.getTime() / 1000);
  return createdSec + ACCELERATOR_PROJECT_VOTING_PERIOD >= nowSec;
}

export const update: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, receiveBlock } = ctx;

  const [projects, numPillarsRow] = await Promise.all([
    tx('nom_accelerator_projects').whereIn('status', [
      AcceleratorProjectStatus.voting,
      AcceleratorProjectStatus.active,
    ]),
    tx('nom_pillars').count('* as c').first(),
  ]);
  const numPillars = Number(numPillarsRow?.c ?? 0);

  // Fetch latest phase for each project
  for (const project of projects) {
    project.phases = await tx('nom_accelerator_phases')
      .where({ project_id: project.id })
      .orderBy('phase_number', 'desc')
      .limit(1);
  }

  // Sort by latest phase creation timestamp (or project creation if no phases)
  projects.sort((a: any, b: any) => {
    const aTime = a.phases[0]?.created_at?.getTime() ?? a.created_at.getTime();
    const bTime = b.phases[0]?.created_at?.getTime() ?? b.created_at.getTime();
    return aTime - bTime;
  });

  for (const project of projects) {
    if (project.status === AcceleratorProjectStatus.voting) {
      const votingOpen = isVotingOpen(project.created_at, receiveBlock.createdAt);

      if (!votingOpen || isQuorumReached(project, numPillars)) {
        const passed = isQuorumReached(project, numPillars);
        await tx('nom_accelerator_projects')
          .where({ id: project.id })
          .update({
            status: passed ? AcceleratorProjectStatus.active : AcceleratorProjectStatus.closed,
            updated_at: receiveBlock.createdAt,
          });
      }
    } else if (project.status === AcceleratorProjectStatus.active) {
      const phase = project.phases[0];
      if (!phase || phase.status !== AcceleratorProjectStatus.voting) {
        continue;
      }

      if (!isQuorumReached(phase, numPillars)) {
        continue;
      }

      // Mark phase as paid
      await tx('nom_accelerator_phases').where({ id: phase.id }).update({
        status: AcceleratorProjectStatus.paid,
        accepted_at: receiveBlock.createdAt,
        updated_at: receiveBlock.createdAt,
      });

      // Update project paid and remaining amounts
      const newZnnPaid = project.znn_paid + phase.znn_requested;
      const newQsrPaid = project.qsr_paid + phase.qsr_requested;
      const newZnnRemaining = project.znn_remaining - phase.znn_requested;
      const newQsrRemaining = project.qsr_remaining - phase.qsr_requested;

      const isComplete = newZnnRemaining <= 0 && newQsrRemaining <= 0;

      await tx('nom_accelerator_projects')
        .where({ id: project.id })
        .update({
          znn_paid: newZnnPaid,
          qsr_paid: newQsrPaid,
          znn_remaining: newZnnRemaining,
          qsr_remaining: newQsrRemaining,
          status: isComplete ? AcceleratorProjectStatus.completed : project.status,
          updated_at: receiveBlock.createdAt,
        });
    }
  }
};
