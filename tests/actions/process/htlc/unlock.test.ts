import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { unlock } = await import('../../../../src/actions/process/htlc/unlock.js');

describe('unlock', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('stores the preimage on the open HTLC', async () => {
    tx.resolveNext({ id: 9 }); // open HTLC lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 44 },
      receiveBlock: { createdAt: new Date('2024-02-01T00:00:00Z') },
      decoded: { id: '0xABCD', preimage: '0x0102FF' },
    });
    await unlock(ctx);

    const lookup = tx.mock.results[0].value;
    expect(lookup.where).toHaveBeenCalledWith({ hash: 'abcd' });
    expect(lookup.whereNull).toHaveBeenCalledWith('unlocked_at');
    expect(lookup.whereNull).toHaveBeenCalledWith('reclaimed_at');
    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 9 });
    expect(update.update).toHaveBeenCalledWith({
      preimage: '0102ff',
      unlock_account_block_id: 44,
      unlocked_at: new Date('2024-02-01T00:00:00Z'),
    });
  });

  it('throws when no open HTLC exists for the id', async () => {
    tx.resolveNext(null); // open HTLC lookup

    const ctx = makeActionContext({ tx, decoded: { id: '0xabcd', preimage: '0x01' } });
    await expect(unlock(ctx)).rejects.toThrow('Htlc.Unlock: open HTLC not found for abcd');
  });
});
