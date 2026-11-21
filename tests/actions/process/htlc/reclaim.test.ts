import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { reclaim } = await import('../../../../src/actions/process/htlc/reclaim.js');

describe('reclaim', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('marks the open HTLC reclaimed', async () => {
    tx.resolveNext({ id: 9 }); // open HTLC lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 45 },
      receiveBlock: { createdAt: new Date('2024-02-01T00:00:00Z') },
      decoded: { id: '0xabcd' },
    });
    await reclaim(ctx);

    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 9 });
    expect(update.update).toHaveBeenCalledWith({
      reclaim_account_block_id: 45,
      reclaimed_at: new Date('2024-02-01T00:00:00Z'),
    });
  });

  it('throws when no open HTLC exists for the id', async () => {
    tx.resolveNext(null); // open HTLC lookup

    const ctx = makeActionContext({ tx, decoded: { id: '0xabcd' } });
    await expect(reclaim(ctx)).rejects.toThrow('Htlc.Reclaim: open HTLC not found for abcd');
  });
});
