import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { wrapToken } = await import('../../../../src/actions/process/bridge/wrap-token.js');

describe('wrapToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    networkClass: 1,
    chainId: 1,
    toAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates wrap record and updates ZNN totals', async () => {
    tx.resolveNext({ id: 10 });                    // findActiveBridgeNetwork
    tx.resolveNext({ id: 20, min_amount: '100' });  // bridgeNetworkToken
    tx.resolveNext(null);                           // bridgeWrap lookup (not found)
    tx.resolveNext({});                             // insert wrap
    tx.resolveNext({ token_standard: 'zts1znnxxxxxxxxxxxxx9z4ulx' }); // token lookup
    tx.resolveNext({});                             // update network totals

    const ctx = makeActionContext({
      tx,
      decoded: defaultDecoded,
      sendBlock: { tokenId: 5, amount: BigInt(500) } as any,
    });
    await expect(wrapToken(ctx)).resolves.toBeUndefined();
  });

  it('creates wrap record and updates QSR totals', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 20, min_amount: '0' });
    tx.resolveNext(null);
    tx.resolveNext({});
    tx.resolveNext({ token_standard: 'zts1qsrxxxxxxxxxxxxxmrhjll' });
    tx.resolveNext({});

    const ctx = makeActionContext({
      tx,
      decoded: defaultDecoded,
      sendBlock: { tokenId: 5, amount: BigInt(1000) } as any,
    });
    await expect(wrapToken(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, toAddress: undefined } });
    await expect(wrapToken(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if network not found', async () => {
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await wrapToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network not found'));
  });

  it('warns if token not bridgeable', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext(null);              // bridgeNetworkToken not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await wrapToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridgeable'));
  });

  it('warns if amount below minimum', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 20, min_amount: '1000' });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: defaultDecoded,
      sendBlock: { amount: BigInt(500) } as any,
    });
    await wrapToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('below minimum'));
  });

  it('skips if wrap already exists (idempotent)', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 20, min_amount: '0' });
    tx.resolveNext({ id: 99 });       // existing wrap found

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(wrapToken(ctx)).resolves.toBeUndefined();
  });
});
