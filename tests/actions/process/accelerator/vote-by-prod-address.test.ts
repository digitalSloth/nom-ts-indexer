import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { AcceleratorProjectVote } from 'znn-typescript-sdk';

const { voteByProdAddress } =
  await import('../../../../src/actions/process/accelerator/vote-by-prod-address.js');

describe('voteByProdAddress', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    // Decoded hash args are 0x-prefixed; rows store bare hex
    id: '0xprojecthash123',
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

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, vote: AcceleratorProjectVote.no },
    });
    await voteByProdAddress(ctx);

    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('looks up the active pillar with the sender as producer', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext({ id: 100 }); // project
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([]); // recount

    await voteByProdAddress(makeActionContext({ tx, decoded: defaultDecoded }));

    const pillarQuery = tx.mock.results[0].value;
    expect(pillarQuery.where).toHaveBeenCalledWith({ producer_account_id: 1 });
    expect(pillarQuery.whereNull).toHaveBeenCalledWith('revoked_at');
  });

  it('throws when no active pillar has the sender as producer', async () => {
    tx.resolveNext(null);

    await expect(
      voteByProdAddress(makeActionContext({ tx, decoded: defaultDecoded })),
    ).rejects.toThrow(
      'Accelerator.VoteByProdAddress: active pillar not found for producer account 1',
    );
  });

  it('throws when the votable item is not indexed', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext(null); // phase not found

    await expect(
      voteByProdAddress(makeActionContext({ tx, decoded: defaultDecoded })),
    ).rejects.toThrow(
      'Accelerator.VoteByProdAddress: votable item not found for hash 0xprojecthash123',
    );
  });

  it('looks up the votable item by its bare hash', async () => {
    tx.resolveNext({ id: 5, owner_id: 1 }); // pillar
    tx.resolveNext(null); // project not found
    tx.resolveNext({ id: 200 }); // phase found
    tx.resolveNext(null); // no existing vote
    tx.resolveNext([]); // recount

    await voteByProdAddress(makeActionContext({ tx, decoded: defaultDecoded }));

    expect(tx.mock.results[1].value.where).toHaveBeenCalledWith({ hash: 'projecthash123' });
    expect(tx.mock.results[2].value.where).toHaveBeenCalledWith({ hash: 'projecthash123' });
  });
});
