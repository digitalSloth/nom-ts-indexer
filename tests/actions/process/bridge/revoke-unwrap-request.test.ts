import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { revokeUnwrapRequest } = await import('../../../../src/actions/process/bridge/revoke-unwrap-request.js');

describe('revokeUnwrapRequest', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('revokes unwrap as admin', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({ id: 42 });        // unwrap lookup
    tx.resolveNext({});                 // update

    const ctx = makeActionContext({
      tx,
      decoded: { transactionHash: '0xtxhash', logIndex: 0 },
    });
    await expect(revokeUnwrapRequest(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing transactionHash', async () => {
    const ctx = makeActionContext({ tx, decoded: { logIndex: 0 } });
    await expect(revokeUnwrapRequest(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { transactionHash: '0xtxhash', logIndex: 0 },
    });
    await revokeUnwrapRequest(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('warns if unwrap not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { transactionHash: '0xtxhash', logIndex: 0 },
    });
    await revokeUnwrapRequest(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
