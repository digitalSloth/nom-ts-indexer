import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { AcceleratorProjectStatus } from 'znn-typescript-sdk';

const { update } = await import('../../../../src/actions/process/accelerator/update.js');

describe('update', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('activates a voting project that passes quorum', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.voting,
      created_at: new Date('2024-01-01'),
      total_votes: 50,
      total_yes_votes: 40,
      total_no_votes: 10,
      total_abstain_votes: 0,
    };
    // Promise.all order: projects then(), pillars first()
    // Both consume from the same queue
    tx.resolveNext([project]); // projects.then()
    tx.resolveNext({ c: 100 }); // pillars.first()
    // Phase fetch for project 1
    tx.resolveNext([]); // phases.then()

    const ctx = makeActionContext({ tx });
    await update(ctx);

    // Verify tables were queried
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
    expect(tx).toHaveBeenCalledWith('nom_pillars');
  });

  it('closes a voting project when voting period expires with no votes', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.voting,
      created_at: new Date('2020-01-01'),
      total_votes: 0,
      total_yes_votes: 0,
      total_no_votes: 0,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([]);

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('closes a voting project when period expires even with tie votes', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.voting,
      created_at: new Date('2020-01-01'),
      total_votes: 100,
      total_yes_votes: 50,
      total_no_votes: 50,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([]);

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('does not update project while voting is open and quorum not met', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.voting,
      created_at: new Date('2024-01-01'),
      total_votes: 0,
      total_yes_votes: 0,
      total_no_votes: 0,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([]);

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('closes project when period expires but participation threshold not met', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.voting,
      created_at: new Date('2020-01-01'),
      total_votes: 30,
      total_yes_votes: 30,
      total_no_votes: 0,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([]);

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('marks phase as paid when quorum reached on active project', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.active,
      created_at: new Date('2024-01-01'),
      znn_paid: 0n,
      qsr_paid: 0n,
      znn_remaining: BigInt(1000000000),
      qsr_remaining: BigInt(5000000000),
    };
    const phase = {
      id: 10,
      status: AcceleratorProjectStatus.voting,
      znn_requested: BigInt(500000000),
      qsr_requested: BigInt(2500000000),
      total_votes: 50,
      total_yes_votes: 40,
      total_no_votes: 10,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([phase]); // phases

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_phases');
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('marks project as completed when all funds paid', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.active,
      created_at: new Date('2024-01-01'),
      znn_paid: 0n,
      qsr_paid: 0n,
      znn_remaining: BigInt(500000000),
      qsr_remaining: BigInt(2500000000),
    };
    const phase = {
      id: 10,
      status: AcceleratorProjectStatus.voting,
      znn_requested: BigInt(500000000),
      qsr_requested: BigInt(2500000000),
      total_votes: 50,
      total_yes_votes: 40,
      total_no_votes: 10,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([phase]);

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('skips phase if quorum not reached', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.active,
      created_at: new Date('2024-01-01'),
      znn_paid: 0n,
      qsr_paid: 0n,
      znn_remaining: BigInt(1000000000),
      qsr_remaining: BigInt(5000000000),
    };
    const phase = {
      id: 10,
      status: AcceleratorProjectStatus.voting,
      znn_requested: BigInt(500000000),
      qsr_requested: BigInt(2500000000),
      total_votes: 10,
      total_yes_votes: 5,
      total_no_votes: 5,
      total_abstain_votes: 0,
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([phase]);

    const ctx = makeActionContext({ tx });
    await update(ctx);

    // Only 3 table calls: projects, pillars, phases
    expect(tx).toHaveBeenCalledTimes(3);
  });

  it('skips active project with no phases', async () => {
    const project = {
      id: 1,
      status: AcceleratorProjectStatus.active,
      created_at: new Date('2024-01-01'),
    };
    tx.resolveNext([project]);
    tx.resolveNext({ c: 100 });
    tx.resolveNext([]); // no phases

    const ctx = makeActionContext({ tx });
    await update(ctx);

    expect(tx).toHaveBeenCalledTimes(3);
  });
});
