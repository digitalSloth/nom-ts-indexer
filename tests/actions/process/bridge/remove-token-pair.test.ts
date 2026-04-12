import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { removeTokenPair } = await import('../../../../src/actions/process/bridge/remove-token-pair.js');

describe('removeTokenPair', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    networkClass: 1,
    chainId: 1,
    tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    tokenAddress: '0xtokenaddr',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('deletes token pair', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({ id: 10 });        // findActiveBridgeNetwork
    tx.resolveNext({ id: 5 });         // token lookup
    tx.resolveNext({});                // del

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(removeTokenPair(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, tokenStandard: undefined } });
    await expect(removeTokenPair(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await removeTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('warns if network not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await removeTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network not found'));
  });

  it('warns if token not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext({ id: 10 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await removeTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('token not found'));
  });
});
