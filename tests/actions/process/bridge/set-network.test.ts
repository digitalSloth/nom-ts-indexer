import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { setNetwork } = await import('../../../../src/actions/process/bridge/set-network.js');

describe('setNetwork', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    networkClass: 1,
    chainId: 1,
    name: 'Ethereum',
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates new network', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext(null);              // findActiveBridgeNetwork
    tx.resolveNext({});                // insert

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(setNetwork(ctx)).resolves.toBeUndefined();
  });

  it('updates existing network and clears deleted_at', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({ id: 10, deleted_at: new Date() }); // findActiveBridgeNetwork
    tx.resolveNext({});                // update

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(setNetwork(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: undefined } });
    await expect(setNetwork(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await setNetwork(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('warns if name length invalid', async () => {
    tx.resolveNext({ account_id: 1 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: 'AB' } });
    await setNetwork(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid name length'));
  });

  it('warns if networkClass < 1', async () => {
    tx.resolveNext({ account_id: 1 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, networkClass: -1 } });
    await setNetwork(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid networkClass'));
  });
});
