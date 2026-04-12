import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { updateWrapRequest } = await import('../../../../src/actions/process/bridge/update-wrap-request.js');

describe('updateWrapRequest', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('updates signature on existing wrap', async () => {
    tx.resolveNext({ id: 42 });  // wrap lookup (joined query)
    tx.resolveNext({});           // update

    const ctx = makeActionContext({
      tx,
      decoded: { id: 'wrapblockhash', signature: 'sig123' },
    });
    await expect(updateWrapRequest(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing id', async () => {
    const ctx = makeActionContext({ tx, decoded: { signature: 'sig' } });
    await expect(updateWrapRequest(ctx)).rejects.toThrow('missing required fields');
  });

  it('throws on missing signature', async () => {
    const ctx = makeActionContext({ tx, decoded: { id: 'hash' } });
    await expect(updateWrapRequest(ctx)).rejects.toThrow('missing required fields');
  });

  it('warns if wrap not found', async () => {
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { id: 'nonexistent', signature: 'sig' },
    });
    await updateWrapRequest(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
