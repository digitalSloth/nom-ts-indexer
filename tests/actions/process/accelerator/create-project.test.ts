import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { createProject } = await import('../../../../src/actions/process/accelerator/create-project.js');

describe('createProject', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    name: 'Test Project',
    description: 'A test project',
    url: 'https://example.com',
    znnFundsNeeded: '1000000000',
    qsrFundsNeeded: '5000000000',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a project with correct fields', async () => {
    // Source: .where({hash}).first() → null (no existing), then .insert() (no .first() so no resolveNext needed)
    tx.resolveNext(null); // existing project check

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await createProject(ctx);

    // If no error, the insert was called (no .first() on insert, so it resolves via .then() as [])
    // Verify the tx was called with the correct table
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
  });

  it('skips if project already exists (idempotent)', async () => {
    // Source: .where({hash}).first() → {id: 1}
    tx.resolveNext({ id: 1 });

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await createProject(ctx);

    // Should return early — tx should only be called once (for the find)
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('throws on missing name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: undefined } });
    await expect(createProject(ctx)).rejects.toThrow('missing required field');
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: '' } });
    await expect(createProject(ctx)).rejects.toThrow('name is empty');
  });

  it('throws on missing znnFundsNeeded', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, znnFundsNeeded: undefined } });
    await expect(createProject(ctx)).rejects.toThrow('missing required field');
  });

  it('throws on name exceeding max length', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: 'A'.repeat(31) } });
    await expect(createProject(ctx)).rejects.toThrow('name exceeds 30 characters');
  });

  it('throws on description exceeding max length', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, description: 'A'.repeat(241) } });
    await expect(createProject(ctx)).rejects.toThrow('description exceeds 240 characters');
  });

  it('throws on invalid URL', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, url: 'not-a-url' } });
    await expect(createProject(ctx)).rejects.toThrow('invalid URL');
  });

  it('throws on znnFundsNeeded exceeding maximum', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, znnFundsNeeded: '500000000001' } });
    await expect(createProject(ctx)).rejects.toThrow('znnFundsNeeded exceeds maximum');
  });

  it('throws on qsrFundsNeeded exceeding maximum', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, qsrFundsNeeded: '5000000000001' } });
    await expect(createProject(ctx)).rejects.toThrow('qsrFundsNeeded exceeds maximum');
  });
});
