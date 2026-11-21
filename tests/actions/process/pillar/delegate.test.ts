import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const addPillarWeight = vi.fn();
const znnBalance = vi.fn();
vi.mock('../../../../src/actions/indexer/pillar-metrics.js', () => ({
  addPillarWeight,
  znnBalance,
}));

const { delegate } = await import('../../../../src/actions/process/pillar/delegate.js');

describe('delegate', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    addPillarWeight.mockReset();
    znnBalance.mockReset();
    znnBalance.mockResolvedValue(700n);
  });

  it('creates delegation to pillar', async () => {
    tx.resolveNext({ id: 10 }); // pillar lookup
    tx.resolveNext(null); // no active delegation
    tx.resolveNext({}); // insert delegation

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await delegate(ctx);

    expect(tx.mock.results[2].value.insert).toHaveBeenCalledWith({
      pillar_id: 10,
      account_id: 1,
      started_at: new Date('2024-01-01T00:00:00Z'),
    });
    expect(addPillarWeight).toHaveBeenCalledTimes(1);
    expect(addPillarWeight).toHaveBeenCalledWith(tx, 10, 700n);
  });

  it('ends existing delegation and creates new one', async () => {
    tx.resolveNext({ id: 10 }); // pillar lookup
    tx.resolveNext({ id: 50, pillar_id: 99 }); // active delegation (different pillar)
    tx.resolveNext({}); // update old delegation
    tx.resolveNext({}); // insert new delegation

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await expect(delegate(ctx)).resolves.toBeUndefined();

    // The balance moves from the old pillar's weight to the new one's.
    expect(addPillarWeight.mock.calls).toEqual([
      [tx, 99, -700n],
      [tx, 10, 700n],
    ]);
  });

  it('changes nothing when already delegated to the same pillar', async () => {
    tx.resolveNext({ id: 10 }); // pillar lookup
    tx.resolveNext({ id: 50, pillar_id: 10 }); // active delegation (same pillar)

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await delegate(ctx);

    expect(tx).toHaveBeenCalledTimes(2);
    expect(addPillarWeight).not.toHaveBeenCalled();
  });

  it('throws when the pillar is not found', async () => {
    tx.resolveNext(null); // pillar lookup

    const ctx = makeActionContext({ tx, decoded: { name: 'Unknown' } });
    await expect(delegate(ctx)).rejects.toThrow('Pillar.Delegate: pillar not found for Unknown');
  });
});
