import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 77);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { unlock, proxyUnlock } = await import('../../../../src/actions/process/ptlc/unlock.js');

describe('ptlc unlock', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockClear();
  });

  it('Unlock pays the sender and stores the witness', async () => {
    tx.resolveNext({ id: 9 }); // open PTLC lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 44, accountId: 7 },
      receiveBlock: { createdAt: new Date('2024-02-01T00:00:00Z') },
      decoded: { id: '0xABCD', signature: '0x0102FF' },
    });
    await unlock(ctx);

    const lookup = tx.mock.results[0].value;
    expect(lookup.where).toHaveBeenCalledWith({ hash: 'abcd' });
    expect(lookup.whereNull).toHaveBeenCalledWith('unlocked_at');
    expect(lookup.whereNull).toHaveBeenCalledWith('reclaimed_at');
    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 9 });
    expect(update.update).toHaveBeenCalledWith({
      signature: '0102ff',
      unlocked_to_account_id: 7,
      unlock_account_block_id: 44,
      unlocked_at: new Date('2024-02-01T00:00:00Z'),
    });
  });

  it('ProxyUnlock pays its destination argument, not the sender', async () => {
    tx.resolveNext({ id: 9 });
    tx.resolveNext({});

    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 44, accountId: 7 },
      decoded: { id: '0xabcd', destination: 'z1payee', signature: '0x01' },
    });
    await proxyUnlock(ctx);

    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1payee');
    expect(tx.mock.results[1].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ unlocked_to_account_id: 77, unlock_account_block_id: 44 }),
    );
  });

  it('throws when no open PTLC exists for the id', async () => {
    tx.resolveNext(null);

    const ctx = makeActionContext({ tx, decoded: { id: '0xabcd', signature: '0x01' } });
    await expect(unlock(ctx)).rejects.toThrow('Ptlc.Unlock: open PTLC not found for abcd');
  });
});
