import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  checkTimeChallenge: vi.fn(async () => ({ isActive: false })),
  assertNoActiveChallenge: vi.fn(async () => true),
}));

const { setTokenPair } = await import('../../../../src/actions/process/bridge/set-token-pair.js');
const { checkTimeChallenge, assertNoActiveChallenge } = await import('../../../../src/actions/process/bridge/time-challenge.js');

describe('setTokenPair', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    networkClass: 1,
    chainId: 1,
    tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    tokenAddress: '0xtokenaddr',
    bridgeable: true,
    redeemable: true,
    owned: false,
    minAmount: '100',
    feePercentage: 100,
    redeemDelay: 600,
    metadata: '{"name":"test"}',
  };

  beforeEach(() => {
    tx = makeMockTx();
    vi.mocked(checkTimeChallenge).mockReset();
    vi.mocked(checkTimeChallenge).mockResolvedValue({ isActive: false });
    vi.mocked(assertNoActiveChallenge).mockReset();
    vi.mocked(assertNoActiveChallenge).mockResolvedValue(true);
  });

  it('creates new token pair', async () => {
    tx.resolveNext({ account_id: 1 });  // assertBridgeAdmin → getActiveAdminAccountId
    tx.resolveNext({ id: 10 });        // findActiveBridgeNetwork
    tx.resolveNext({ id: 5 });         // token lookup
    tx.resolveNext(null);              // bridgeNetworkToken lookup (not found)
    tx.resolveNext({});                // insert

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(setTokenPair(ctx)).resolves.toBeUndefined();
  });

  it('updates existing token pair', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 5 });
    tx.resolveNext({ id: 42 });       // existing bridgeNetworkToken
    tx.resolveNext({});                // update

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(setTokenPair(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, tokenStandard: undefined } });
    await expect(setTokenPair(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await setTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('warns if time challenge still active', async () => {
    tx.resolveNext({ account_id: 1 });
    vi.mocked(assertNoActiveChallenge).mockResolvedValue(false);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await setTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('time challenge'));
  });

  it('warns if network not found', async () => {
    tx.resolveNext({ account_id: 1 });  // assertBridgeAdmin
    tx.resolveNext(null);              // findActiveBridgeNetwork
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await setTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network not found'));
  });

  it('warns if token not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext({ id: 10 });
    tx.resolveNext(null);              // token lookup
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await setTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('token not found'));
  });

  it('warns if ZNN/QSR owned', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 5 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, owned: true, tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx' },
    });
    await setTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cannot be owned'));
  });

  it('warns if redeemDelay is 0', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext({ id: 10 });
    tx.resolveNext({ id: 5 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, redeemDelay: 0 },
    });
    await setTokenPair(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('redeemDelay'));
  });
});
