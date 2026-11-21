import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { updatePhase } = await import('../../../../src/actions/process/accelerator/update-phase.js');

describe('updatePhase', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    // Decoded hash args are 0x-prefixed; rows store bare hex
    id: '0xprojecthash123',
    name: 'Updated Phase',
    description: 'Updated description',
    url: 'https://example.com/updated',
    znnFundsNeeded: '500000000',
    qsrFundsNeeded: '2500000000',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('replaces the current phase and deletes its votes', async () => {
    tx.resolveNext({ id: 1 }); // project
    tx.resolveNext({ id: 10 }); // current phase

    await updatePhase(makeActionContext({ tx, decoded: defaultDecoded }));

    const builders = tx.mock.results.map((r: any) => r.value);
    const phaseUpdate = builders[2].update.mock.calls[0][0];
    expect(phaseUpdate).toMatchObject({
      hash: 'sendblockhash123',
      name: 'Updated Phase',
      znn_requested: 500000000n,
      qsr_requested: 2500000000n,
      total_votes: 0,
      total_yes_votes: 0,
      total_no_votes: 0,
      total_abstain_votes: 0,
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
    expect(tx).toHaveBeenCalledWith('nom_votes');
    expect(builders[3].del).toHaveBeenCalled();
  });

  it('throws when the project is not indexed', async () => {
    tx.resolveNext(null);

    await expect(updatePhase(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Accelerator.UpdatePhase: project not found for hash projecthash123',
    );
  });

  it('throws when the project has no phase', async () => {
    tx.resolveNext({ id: 1 });
    tx.resolveNext(null);

    await expect(updatePhase(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Accelerator.UpdatePhase: phase not found for project projecthash123',
    );
  });

  it('looks up the project by its bare hash', async () => {
    tx.resolveNext(null);

    await expect(updatePhase(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow();

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({ hash: 'projecthash123' });
  });
});
