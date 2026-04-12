import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { fuse } = await import('../../../../src/actions/process/plasma/fuse.js');

describe('fuse', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(50);
  });

  it('creates plasma record', async () => {
    tx.resolveNext(null); // no existing plasma
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({
      tx,
      decoded: { address: 'z1qbeneficiary' },
      sendBlock: { id: 10, accountId: 1, amount: '1000000000' } as any,
    });
    await expect(fuse(ctx)).resolves.toBeUndefined();

    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1qbeneficiary');
  });

  it('skips if plasma already exists (idempotent)', async () => {
    tx.resolveNext({ id: 99 }); // existing plasma found

    const ctx = makeActionContext({
      tx,
      decoded: { address: 'z1qbeneficiary' },
      sendBlock: { id: 10, amount: '1000' } as any,
    });
    await expect(fuse(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing address', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(fuse(ctx)).rejects.toThrow('missing address');
  });

  it('warns if amount is zero', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { address: 'z1qbeneficiary' },
      sendBlock: { amount: '0' } as any,
    });
    await fuse(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('amount is zero'));
  });
});
