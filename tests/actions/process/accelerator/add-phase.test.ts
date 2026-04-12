import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { addPhase } = await import('../../../../src/actions/process/accelerator/add-phase.js');

describe('addPhase', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    id: 'projecthash123',
    name: 'Phase 1',
    description: 'First phase',
    url: 'https://example.com',
    znnFundsNeeded: '500000000',
    qsrFundsNeeded: '2500000000',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a phase for an active project', async () => {
    // 1. find project → {id:1, owner_id:1, status:1}
    tx.resolveNext({ id: 1, owner_id: 1, status: 1 });
    // 2. find latest phase → null (first phase)
    tx.resolveNext(null);

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await addPhase(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
    expect(tx).toHaveBeenCalledWith('nom_accelerator_phases');
  });

  it('increments phase number from latest phase', async () => {
    tx.resolveNext({ id: 1, owner_id: 1, status: 1 });
    tx.resolveNext({ id: 5, status: 2, phase_number: 3 });

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await addPhase(ctx);

    expect(tx).toHaveBeenCalledWith('nom_accelerator_phases');
  });

  it('warns if project not found', async () => {
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await addPhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('project not found'));
  });

  it('warns if sender is not project owner', async () => {
    tx.resolveNext({ id: 1, owner_id: 999, status: 1 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await addPhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not project owner'));
  });

  it('warns if project is not active', async () => {
    tx.resolveNext({ id: 1, owner_id: 1, status: 0 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await addPhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not active'));
  });

  it('warns if latest phase is not paid', async () => {
    tx.resolveNext({ id: 1, owner_id: 1, status: 1 });
    tx.resolveNext({ id: 5, status: 0, phase_number: 1 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await addPhase(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not paid'));
  });

  it('throws on name exceeding max length', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: 'A'.repeat(31) } });
    await expect(addPhase(ctx)).rejects.toThrow('name exceeds 30 characters');
  });

  it('throws on description exceeding max length', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, description: 'A'.repeat(241) } });
    await expect(addPhase(ctx)).rejects.toThrow('description exceeds 240 characters');
  });

  it('throws on invalid URL', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, url: 'not-a-url' } });
    await expect(addPhase(ctx)).rejects.toThrow('invalid URL');
  });

  it('throws on znnFundsNeeded exceeding maximum', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, znnFundsNeeded: '500000000001' } });
    await expect(addPhase(ctx)).rejects.toThrow('znnFundsNeeded exceeds maximum');
  });
});
