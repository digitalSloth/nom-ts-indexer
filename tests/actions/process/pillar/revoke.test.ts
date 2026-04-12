import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { revoke } = await import('../../../../src/actions/process/pillar/revoke.js');

describe('revoke', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('revokes the pillar', async () => {
    tx.resolveNext({ id: 42, owner_id: 1, revoked_at: null }); // pillar lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await expect(revoke(ctx)).resolves.toBeUndefined();
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { name: '' } });
    await expect(revoke(ctx)).rejects.toThrow('name is empty');
  });

  it('warns if pillar not found', async () => {
    tx.resolveNext(null); // pillar not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { name: 'Unknown' } });
    await revoke(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('warns if sender is not owner', async () => {
    tx.resolveNext({ id: 42, owner_id: 999, revoked_at: null }); // wrong owner
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await revoke(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not pillar owner'));
  });

  it('skips if already revoked (idempotent)', async () => {
    tx.resolveNext({ id: 42, owner_id: 1, revoked_at: new Date() }); // already revoked

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await expect(revoke(ctx)).resolves.toBeUndefined();
  });
});
