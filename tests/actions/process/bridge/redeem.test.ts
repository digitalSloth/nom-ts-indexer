import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { redeem } = await import('../../../../src/actions/process/bridge/redeem.js');

describe('redeem', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('marks unwrap as redeemed', async () => {
    tx.resolveNext({ id: 42 });  // unwrap lookup
    tx.resolveNext({});           // update

    const ctx = makeActionContext({
      tx,
      decoded: { transactionHash: '0xtxhash', logIndex: 0 },
    });
    await expect(redeem(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing transactionHash', async () => {
    const ctx = makeActionContext({ tx, decoded: { logIndex: 0 } });
    await expect(redeem(ctx)).rejects.toThrow('missing required fields');
  });

  it('throws on missing logIndex', async () => {
    const ctx = makeActionContext({ tx, decoded: { transactionHash: '0xhash' } });
    await expect(redeem(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if unredeemed unwrap not found', async () => {
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { transactionHash: '0xhash', logIndex: 0 },
    });
    await redeem(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
