import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const addPillarWeight = vi.fn();
const znnBalance = vi.fn();
vi.mock('../../../../src/actions/indexer/pillar-metrics.js', () => ({
  addPillarWeight,
  znnBalance,
}));

const { undelegate } = await import('../../../../src/actions/process/pillar/undelegate.js');

describe('undelegate', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    addPillarWeight.mockReset();
    znnBalance.mockReset();
  });

  it('ends the active delegation and takes the balance off the pillar weight', async () => {
    tx.resolveNext({ id: 50, pillar_id: 10 }); // active delegation
    tx.resolveNext({}); // update
    znnBalance.mockResolvedValue(700n);

    const ctx = makeActionContext({ tx });
    await undelegate(ctx);

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({ account_id: 1, ended_at: null });
    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 50 });
    expect(update.update).toHaveBeenCalledWith({ ended_at: new Date('2024-01-01T00:00:00Z') });
    expect(znnBalance).toHaveBeenCalledWith(tx, 1);
    expect(addPillarWeight).toHaveBeenCalledWith(tx, 10, -700n);
  });

  it('throws when the sender has no active delegation', async () => {
    tx.resolveNext(null);

    await expect(undelegate(makeActionContext({ tx }))).rejects.toThrow(
      'Pillar.Undelegate: delegation not found for account 1',
    );
  });
});
