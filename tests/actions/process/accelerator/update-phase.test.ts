import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { updatePhase } = await import('../../../../src/actions/process/accelerator/update-phase.js');

describe('updatePhase', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    id: 'projecthash123',
    name: 'Updated Phase',
    description: 'Updated description',
    url: 'https://example.com/updated',
    znnFundsNeeded: '500000000',
    qsrFundsNeeded: '2500000000',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('updates a phase in voting status', async () => {
    // 1. find project by hash → .first()
    tx.resolveNext({ id: 1, owner_id: 1 });
    // 2. find latest phase → .first()
    tx.resolveNext({ id: 10, status: 0 });

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePhase(ctx);

    // Verify the correct tables were queried
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
    expect(tx).toHaveBeenCalledWith('nom_accelerator_phases');
    expect(tx).toHaveBeenCalledWith('nom_votes');
  });

  it('throws on missing required fields', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: undefined } });
    await expect(updatePhase(ctx)).rejects.toThrow('missing required field');
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: '' } });
    await expect(updatePhase(ctx)).rejects.toThrow('name is empty');
  });

  it('warns if project not found', async () => {
    tx.resolveNext(null); // project not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('project not found'));
  });

  it('warns if sender is not project owner', async () => {
    tx.resolveNext({ id: 1, owner_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not project owner'));
  });

  it('warns if no phase found', async () => {
    tx.resolveNext({ id: 1, owner_id: 1 });
    tx.resolveNext(null); // no phase
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no phase found'));
  });

  it('warns if phase is not in voting status', async () => {
    tx.resolveNext({ id: 1, owner_id: 1 });
    tx.resolveNext({ id: 10, status: 2 }); // paid, not voting
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not in voting status'));
  });
});
