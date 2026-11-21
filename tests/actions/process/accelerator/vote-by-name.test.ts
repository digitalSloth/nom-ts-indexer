import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { AcceleratorProjectVote } from 'znn-typescript-sdk';

const { voteByName } = await import('../../../../src/actions/process/accelerator/vote-by-name.js');

describe('voteByName', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    // Decoded hash args are 0x-prefixed; rows store bare hex
    id: '0xprojecthash123',
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

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, vote: AcceleratorProjectVote.no },
    });
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

  it('looks up the active pillar with that name', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext({ id: 100 }); // project
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([]); // recount

    await voteByName(makeActionContext({ tx, decoded: defaultDecoded }));

    const pillarQuery = tx.mock.results[0].value;
    expect(pillarQuery.where).toHaveBeenCalledWith({ name: 'MyPillar' });
    expect(pillarQuery.whereNull).toHaveBeenCalledWith('revoked_at');
  });

  it('throws when no active pillar has that name', async () => {
    tx.resolveNext(null);

    await expect(voteByName(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Accelerator.VoteByName: active pillar not found for name MyPillar',
    );
  });

  it('throws when the votable item is not indexed', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext(null); // phase not found

    await expect(voteByName(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Accelerator.VoteByName: votable item not found for hash 0xprojecthash123',
    );
  });

  it('looks up the votable item by its bare hash', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext({ id: 200 }); // phase found
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([]); // recount

    await voteByName(makeActionContext({ tx, decoded: defaultDecoded }));

    expect(tx.mock.results[1].value.where).toHaveBeenCalledWith({ hash: 'projecthash123' });
    expect(tx.mock.results[2].value.where).toHaveBeenCalledWith({ hash: 'projecthash123' });
  });
});
