import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { cancel } = await import('../../../../src/actions/process/stake/cancel.js');

describe('cancel', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('ends stake when original block and active stake exist', async () => {
    tx.resolveNext({ id: 42 });   // original block found
    tx.resolveNext({ id: 55, accountId: 1, amount: '1000000000' }); // active stake found
    tx.resolveNext({});            // update

    const ctx = makeActionContext({ tx, decoded: { id: 'originalblockhash' } });
    await expect(cancel(ctx)).resolves.toBeUndefined();
  });

  it('strips 0x prefix from hash', async () => {
    tx.resolveNext({ id: 42 });   // original block found
    tx.resolveNext({ id: 55, accountId: 1, amount: '500' }); // active stake found
    tx.resolveNext({});            // update

    const ctx = makeActionContext({ tx, decoded: { id: '0xoriginalblockhash' } });
    await expect(cancel(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing id', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(cancel(ctx)).rejects.toThrow('missing id');
  });

  it('warns if original block not found', async () => {
    tx.resolveNext(null); // original block not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { id: 'nonexistent' } });
    await cancel(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('block'));
  });

  it('warns if active stake not found', async () => {
    tx.resolveNext({ id: 42 }); // original block found
    tx.resolveNext(null);        // active stake not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { id: 'originalblockhash' } });
    await cancel(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('active stake'));
  });
});
