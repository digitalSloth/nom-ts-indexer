import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { setNetworkMetadata } = await import('../../../../src/actions/process/bridge/set-network-metadata.js');

describe('setNetworkMetadata', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('updates metadata', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({ id: 10 });        // findActiveBridgeNetwork
    tx.resolveNext({});                // update

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1, metadata: '{"foo":"bar"}' },
    });
    await expect(setNetworkMetadata(ctx)).resolves.toBeUndefined();
  });

  it('stringifies object metadata', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext({ id: 10 });
    tx.resolveNext({});

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1, metadata: { foo: 'bar' } },
    });
    await expect(setNetworkMetadata(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { networkClass: 1, chainId: 1 } });
    await expect(setNetworkMetadata(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1, metadata: '{}' },
    });
    await setNetworkMetadata(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('warns if network not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { networkClass: 1, chainId: 1, metadata: '{}' },
    });
    await setNetworkMetadata(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
