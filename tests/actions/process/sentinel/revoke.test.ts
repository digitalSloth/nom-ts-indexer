import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { revoke } = await import('../../../../src/actions/process/sentinel/revoke.js');

describe('sentinel revoke', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('revokes the active sentinel', async () => {
    tx.resolveNext({ id: 42 }); // active sentinel lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({ tx });
    await revoke(ctx);

    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 42 });
    expect(update.update).toHaveBeenCalledWith({ revoked_at: new Date('2024-01-01T00:00:00Z') });
  });

  it('throws when the sender has no active sentinel', async () => {
    tx.resolveNext(null); // active sentinel lookup

    const ctx = makeActionContext({ tx });
    await expect(revoke(ctx)).rejects.toThrow(
      'Sentinel.Revoke: active sentinel not found for account 1',
    );
  });
});
