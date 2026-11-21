import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { cancelFuse } = await import('../../../../src/actions/process/plasma/cancel-fuse.js');

describe('cancelFuse', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('ends the active fusion created by the given block', async () => {
    tx.resolveNext({ id: 77 }); // active fusion lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({ tx, decoded: { id: '0xfusehash' } });
    await cancelFuse(ctx);

    const lookup = tx.mock.results[0].value;
    expect(lookup.where).toHaveBeenCalledWith({ hash: 'fusehash' });
    expect(lookup.whereNull).toHaveBeenCalledWith('ended_at');
    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 77 });
    expect(update.update).toHaveBeenCalledWith({ ended_at: new Date('2024-01-01T00:00:00Z') });
  });

  it('throws when no active fusion exists for the id', async () => {
    tx.resolveNext(null); // active fusion lookup

    const ctx = makeActionContext({ tx, decoded: { id: 'fusehash' } });
    await expect(cancelFuse(ctx)).rejects.toThrow(
      'Plasma.CancelFuse: active fusion not found for fusehash',
    );
  });
});
