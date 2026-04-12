import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { cancelFuse } = await import('../../../../src/actions/process/plasma/cancel-fuse.js');

describe('cancelFuse', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('ends plasma when original block and active plasma exist', async () => {
    tx.resolveNext({ id: 42 }); // original block found
    tx.resolveNext({ id: 55, fromAccountId: 1, toAccountId: 50, amount: '1000000000' }); // active plasma
    tx.resolveNext({});          // update

    const ctx = makeActionContext({ tx, decoded: { id: 'originalblockhash' } });
    await expect(cancelFuse(ctx)).resolves.toBeUndefined();
  });

  it('strips 0x prefix from hash', async () => {
    tx.resolveNext({ id: 42 }); // original block found
    tx.resolveNext({ id: 55, fromAccountId: 1, toAccountId: 50, amount: '500' }); // active plasma
    tx.resolveNext({});          // update

    const ctx = makeActionContext({ tx, decoded: { id: '0xoriginalblockhash' } });
    await expect(cancelFuse(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing id', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(cancelFuse(ctx)).rejects.toThrow('missing id');
  });

  it('warns if original block not found', async () => {
    tx.resolveNext(null); // original block not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { id: 'nonexistent' } });
    await cancelFuse(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('block'));
  });

  it('warns if active plasma row not found', async () => {
    tx.resolveNext({ id: 42 }); // original block found
    tx.resolveNext(null);        // active plasma not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { id: 'originalblockhash' } });
    await cancelFuse(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('plasma row'));
  });
});
