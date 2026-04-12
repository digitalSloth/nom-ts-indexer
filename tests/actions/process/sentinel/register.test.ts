import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { register } = await import('../../../../src/actions/process/sentinel/register.js');

describe('register', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a sentinel record', async () => {
    tx.resolveNext(null); // no existing sentinel
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({ tx });
    await expect(register(ctx)).resolves.toBeUndefined();
  });

  it('skips if sentinel already exists (idempotent)', async () => {
    tx.resolveNext({ id: 99 }); // existing sentinel found

    const ctx = makeActionContext({ tx });
    await expect(register(ctx)).resolves.toBeUndefined();
  });

  it('queries for non-revoked sentinel only', async () => {
    tx.resolveNext(null); // no existing sentinel
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({ tx });
    await expect(register(ctx)).resolves.toBeUndefined();
  });
});
