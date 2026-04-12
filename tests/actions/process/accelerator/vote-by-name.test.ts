import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { AcceleratorProjectVote } from 'znn-typescript-sdk';

const { voteByName } = await import('../../../../src/actions/process/accelerator/vote-by-name.js');

describe('voteByName', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    id: 'projecthash123',
    name: 'MyPillar',
    vote: AcceleratorProjectVote.yes,
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a new vote on a project', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext({ id: 100 }); // project
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([
      { vote: AcceleratorProjectVote.yes },
      { vote: AcceleratorProjectVote.yes },
      { vote: AcceleratorProjectVote.no },
    ]); // recount votes

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByName(ctx);

    expect(tx).toHaveBeenCalledWith('nom_pillars');
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('updates an existing vote', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext({ id: 100 }); // project
    tx.resolveNext({ id: 50 }); // existing vote
    tx.resolveNext([{ vote: AcceleratorProjectVote.no }]); // recount

    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, vote: AcceleratorProjectVote.no } });
    await voteByName(ctx);

    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('falls back to phase when project not found', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext({ id: 200 }); // phase found
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([]); // recount

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByName(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_phases');
    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('throws on missing id', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, id: undefined } });
    await expect(voteByName(ctx)).rejects.toThrow('missing required field "id"');
  });

  it('throws on missing name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: undefined } });
    await expect(voteByName(ctx)).rejects.toThrow('missing required field "name"');
  });

  it('throws on missing vote', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, vote: undefined } });
    await expect(voteByName(ctx)).rejects.toThrow('missing required field "vote"');
  });

  it('warns if pillar not found', async () => {
    tx.resolveNext(null); // pillar not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByName(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pillar'));
  });

  it('warns if sender is not pillar owner', async () => {
    tx.resolveNext({ id: 5, owner_id: 999 }); // pillar with different owner
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByName(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not pillar owner'));
  });

  it('warns if votable item not found', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext(null); // phase not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await voteByName(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('votable item not found'));
  });
});
