import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { cancel } = await import('../../../../src/actions/process/stake/cancel.js');

describe('cancel', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('ends the stake created by the given block', async () => {
    tx.resolveNext({ id: 55, ended_at: null }); // stake lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({ tx, decoded: { id: '0xstakehash' } });
    await cancel(ctx);

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith('ab.hash', 'stakehash');
    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 55 });
    expect(update.update).toHaveBeenCalledWith({ ended_at: new Date('2024-01-01T00:00:00Z') });
  });

  it('changes nothing when the stake already ended', async () => {
    tx.resolveNext({ id: 55, ended_at: new Date('2023-12-01T00:00:00Z') }); // stake lookup

    const ctx = makeActionContext({ tx, decoded: { id: 'stakehash' } });
    await cancel(ctx);

    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('throws when the stake is not found', async () => {
    tx.resolveNext(null); // stake lookup

    const ctx = makeActionContext({ tx, decoded: { id: 'stakehash' } });
    await expect(cancel(ctx)).rejects.toThrow('Stake.Cancel: stake not found for stakehash');
  });
});
