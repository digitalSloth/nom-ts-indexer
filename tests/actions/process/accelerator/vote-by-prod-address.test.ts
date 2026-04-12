import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { AcceleratorProjectVote } from 'znn-typescript-sdk';

const { voteByProdAddress } = await import('../../../../src/actions/process/accelerator/vote-by-prod-address.js');

describe('voteByProdAddress', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    id: 'projecthash123',
    vote: AcceleratorProjectVote.yes,
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a new vote on a project by producer address', async () => {
    // 1. pillar lookup → .first()
    tx.resolveNext({ id: 5, owner_id: 1 });
    // 2. resolveVotable: project lookup → .first()
    tx.resolveNext({ id: 100 });
    // 3. upsertVote: existing vote check → .first()
    tx.resolveNext(null);
    // 4. recountVotes: votes query → .then()
    tx.resolveNext([{ vote: AcceleratorProjectVote.yes }]);

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByProdAddress(ctx);

    expect(tx).toHaveBeenCalledWith('nom_pillars');
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('falls back to phase when project not found', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext({ id: 200 }); // phase found
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([]); // recount votes

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByProdAddress(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_phases');
    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('updates an existing vote', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext({ id: 100 }); // project
    tx.resolveNext({ id: 50 }); // existing vote
    tx.resolveNext([{ vote: AcceleratorProjectVote.no }]); // recount

    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, vote: AcceleratorProjectVote.no } });
    await voteByProdAddress(ctx);

    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('throws on missing id', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, id: undefined } });
    await expect(voteByProdAddress(ctx)).rejects.toThrow('missing required field "id"');
  });

  it('throws on missing vote', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, vote: undefined } });
    await expect(voteByProdAddress(ctx)).rejects.toThrow('missing required field "vote"');
  });

  it('warns if pillar not found for producer address', async () => {
    tx.resolveNext(null); // pillar not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByProdAddress(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pillar not found'));
  });

  it('warns if votable item not found', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext(null); // phase not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByProdAddress(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('votable item not found'));
  });
});
