import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { revoke } = await import('../../../../src/actions/process/sentinel/revoke.js');

describe('revoke', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('revokes the active sentinel', async () => {
    tx.resolveNext({ id: 42 }); // active sentinel found
    tx.resolveNext({});          // update

    const ctx = makeActionContext({ tx });
    await expect(revoke(ctx)).resolves.toBeUndefined();
  });

  it('warns if no active sentinel found', async () => {
    tx.resolveNext(null); // no active sentinel
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx });
    await revoke(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no active sentinel'));
  });
});
