import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { delegate } = await import('../../../../src/actions/process/pillar/delegate.js');

describe('delegate', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates delegation to pillar', async () => {
    tx.resolveNext({ id: 10, revoked_at: null }); // pillar lookup
    tx.resolveNext(null);  // no active delegation
    tx.resolveNext({});    // insert delegation

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await expect(delegate(ctx)).resolves.toBeUndefined();
  });

  it('ends existing delegation and creates new one', async () => {
    tx.resolveNext({ id: 10, revoked_at: null }); // pillar lookup
    tx.resolveNext({ id: 50, pillar_id: 99 });    // active delegation (different pillar)
    tx.resolveNext({});   // update old delegation
    tx.resolveNext({});   // insert new delegation

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await expect(delegate(ctx)).resolves.toBeUndefined();
  });

  it('skips if already delegated to same pillar (idempotent)', async () => {
    tx.resolveNext({ id: 10, revoked_at: null }); // pillar lookup
    tx.resolveNext({ id: 50, pillar_id: 10 });    // active delegation (same pillar)

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await expect(delegate(ctx)).resolves.toBeUndefined();
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { name: '' } });
    await expect(delegate(ctx)).rejects.toThrow('name is empty');
  });

  it('warns if pillar not found', async () => {
    tx.resolveNext(null); // pillar not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { name: 'Unknown' } });
    await delegate(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('warns if pillar is revoked', async () => {
    tx.resolveNext({ id: 10, revoked_at: new Date('2023-12-31') }); // revoked
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await delegate(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revoked'));
  });
});
