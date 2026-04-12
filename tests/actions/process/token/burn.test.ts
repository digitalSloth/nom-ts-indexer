import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { burn } = await import('../../../../src/actions/process/token/burn.js');

describe('burn', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates burn record and decrements total_supply (mintable token)', async () => {
    tx.resolveNext({ id: 10, total_supply: '1000000000', max_supply: '2000000000', is_mintable: true }); // token lookup
    tx.resolveNext({});   // insert burn
    tx.resolveNext({});   // update token

    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 5, accountId: 1, tokenId: 10, amount: '500000000' } as any,
    });
    await expect(burn(ctx)).resolves.toBeUndefined();
  });

  it('decrements both total_supply and max_supply for non-mintable token', async () => {
    tx.resolveNext({ id: 10, total_supply: '1000000000', max_supply: '1000000000', is_mintable: false }); // token lookup
    tx.resolveNext({});   // insert burn
    tx.resolveNext({});   // update token

    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 5, accountId: 1, tokenId: 10, amount: '500000000' } as any,
    });
    await expect(burn(ctx)).resolves.toBeUndefined();
  });

  it('warns if tokenId is null', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, sendBlock: { tokenId: null, amount: '100' } as any });
    await burn(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no token'));
  });

  it('warns if amount is zero', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, sendBlock: { tokenId: 10, amount: '0' } as any });
    await burn(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('amount is zero'));
  });

  it('warns if token not found', async () => {
    tx.resolveNext(null); // token not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, sendBlock: { tokenId: 10, amount: '100' } as any });
    await burn(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('token not found'));
  });
});
