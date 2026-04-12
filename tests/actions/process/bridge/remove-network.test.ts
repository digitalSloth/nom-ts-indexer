import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { removeNetwork } = await import('../../../../src/actions/process/bridge/remove-network.js');

describe('removeNetwork', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('soft-deletes network', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({ id: 10 });        // findActiveBridgeNetwork
    tx.resolveNext({});                // update

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1 },
    });
    await expect(removeNetwork(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { networkClass: 1 } });
    await expect(removeNetwork(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1 },
    });
    await removeNetwork(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('warns if network not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext(null);              // findActiveBridgeNetwork returns null
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1 },
    });
    await removeNetwork(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
