import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { unwrapToken } = await import('../../../../src/actions/process/bridge/unwrap-token.js');

describe('unwrapToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    networkClass: 1,
    chainId: 1,
    transactionHash: '0xtxhash',
    logIndex: 0,
    toAddress: 'z1qql0agp20rzy8e4e8z4fq0s',
    tokenAddress: '0xtokenaddr',
    amount: '1000000000',
    signature: 'sig123',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates new unwrap record', async () => {
    tx.resolveNext({ id: 10 });                // findActiveBridgeNetwork
    tx.resolveNext({ id: 20, token_id: 5 });    // bridgeNetworkToken
    tx.resolveNext(null);                       // duplicate check (not found)
    tx.resolveNext({});                         // insert
    tx.resolveNext({ token_standard: 'zts1znnxxxxxxxxxxxxx9z4ulx' }); // token lookup
    tx.resolveNext({});                         // update network totals

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(unwrapToken(ctx)).resolves.toBeUndefined();
  });

  it('rejects duplicate unwrap request', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 20, token_id: 5 });
    tx.resolveNext({ id: 99 });       // duplicate found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await unwrapToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate'));
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, transactionHash: undefined } });
    await expect(unwrapToken(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if network not found', async () => {
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await unwrapToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network not found'));
  });

  it('warns if token not redeemable', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await unwrapToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not redeemable'));
  });
});
