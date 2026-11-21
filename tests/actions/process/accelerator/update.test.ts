import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { AcceleratorProjectStatus } from 'znn-typescript-sdk';

const { update } = await import('../../../../src/actions/process/accelerator/update.js');

const NOW = new Date('2024-03-01T00:00:00Z'); // frontier momentum time
const CONFIRMED = new Date('2024-03-01T00:00:20Z'); // receive block confirmation time
const OPEN = new Date('2024-02-25T00:00:00Z'); // inside the 14-day voting period
const EXPIRED = new Date('2024-01-01T00:00:00Z'); // past the voting period

function phaseIdRaw(hex: string) {
  return { raw: Buffer.from(hex, 'hex').toString('base64') };
}

describe('update', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  function ctx() {
    return makeActionContext({
      tx,
      receiveBlock: { id: 5, createdAt: CONFIRMED },
      frontierMomentum: { timestamp: NOW },
    });
  }

  function updates() {
    return tx.mock.results.flatMap((r: any) => r.value.update.mock.calls.map((c: any[]) => c[0]));
  }

  function votingProject(createdAt: Date, yes: number, no: number) {
    return {
      id: 1,
      status: AcceleratorProjectStatus.voting,
      created_at: createdAt,
      total_votes: yes + no,
      total_yes_votes: yes,
      total_no_votes: no,
    };
  }

  // Queue order: voting projects, active pillar count, one result per status
  // update, then the payout rows.
  async function runVoting(project: any, changes: boolean) {
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    if (changes) tx.resolveNext({});
    tx.resolveNext([]);
    await update(ctx());
  }

  describe('voting projects', () => {
    it('counts only active pillars toward quorum', async () => {
      tx.resolveNext([]);
      tx.resolveNext({ c: 100 });
      tx.resolveNext([]);
      await update(ctx());
      expect(tx.mock.results[1].value.whereNull).toHaveBeenCalledWith('revoked_at');
    });

    it('activates a project that reaches quorum inside its voting period', async () => {
      await runVoting(votingProject(OPEN, 40, 10), true);
      expect(updates()).toEqual([
        { status: AcceleratorProjectStatus.active, accepted_at: NOW, updated_at: CONFIRMED },
      ]);
    });

    it('leaves a project unchanged while its period is open without quorum', async () => {
      await runVoting(votingProject(OPEN, 5, 5), false);
      expect(updates()).toEqual([]);
    });

    it('closes a project once its period ends, even with quorum', async () => {
      await runVoting(votingProject(EXPIRED, 40, 10), true);
      expect(updates()).toEqual([
        { status: AcceleratorProjectStatus.closed, updated_at: CONFIRMED },
      ]);
    });

    it('measures the voting period against the frontier momentum time', async () => {
      // Created 14 days before the frontier time, so the period is still open
      // at the frontier even though the receive was confirmed 20 s later.
      const createdAt = new Date(NOW.getTime() - 14 * 24 * 3600 * 1000);
      await runVoting(votingProject(createdAt, 40, 10), true);
      expect(updates()).toEqual([
        { status: AcceleratorProjectStatus.active, accepted_at: NOW, updated_at: CONFIRMED },
      ]);
    });
  });

  describe('phase payouts', () => {
    // bigint columns arrive from Postgres as strings
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.active,
      znn_paid: '100000000',
      qsr_paid: '500000000',
      znn_remaining: '1000000000',
      qsr_remaining: '5000000000',
    };
    const phase = {
      id: 10,
      project_id: 1,
      znn_requested: '500000000',
      qsr_requested: '2500000000',
    };
    const PHASE_HASH = 'ab'.repeat(32);

    // Queue order: no voting projects, pillar count, payout rows, then the
    // phase and project lookups for each paid phase.
    async function runPayout(payoutRows: any[], lookups: any[]) {
      tx.resolveNext([]);
      tx.resolveNext({ c: 100 });
      tx.resolveNext(payoutRows);
      for (const l of lookups) tx.resolveNext(l);
      await update(ctx());
    }

    it('reads paid phases from the payout sends of this receive', async () => {
      await runPayout([phaseIdRaw(PHASE_HASH), phaseIdRaw(PHASE_HASH)], [phase, project]);

      const payoutQuery = tx.mock.results[2].value;
      expect(payoutQuery.where).toHaveBeenCalledWith('ab.parent_id', 5);
      expect(tx.mock.results[3].value.where).toHaveBeenCalledWith({ hash: PHASE_HASH });
      expect(updates()).toEqual([
        { status: AcceleratorProjectStatus.paid, accepted_at: NOW, updated_at: CONFIRMED },
        {
          znn_paid: '600000000',
          qsr_paid: '3000000000',
          znn_remaining: '500000000',
          qsr_remaining: '2500000000',
          status: AcceleratorProjectStatus.active,
          updated_at: CONFIRMED,
        },
      ]);
    });

    it('completes the project when the paid phase uses its remaining funds', async () => {
      await runPayout(
        [phaseIdRaw(PHASE_HASH)],
        [phase, { ...project, znn_remaining: '500000000', qsr_remaining: '2500000000' }],
      );
      expect(updates()[1]).toMatchObject({
        znn_remaining: '0',
        qsr_remaining: '0',
        status: AcceleratorProjectStatus.completed,
      });
    });

    it('pays nothing when the receive has no payout sends', async () => {
      await runPayout([], []);
      expect(updates()).toEqual([]);
    });

    it('throws when a paid phase is not indexed', async () => {
      await expect(runPayout([phaseIdRaw(PHASE_HASH)], [null])).rejects.toThrow(
        `Accelerator.Update: phase not found for paid hash ${PHASE_HASH}`,
      );
    });
  });
});
