import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { revoke } = await import('../../../../src/actions/process/pillar/revoke.js');

describe('revoke', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('revokes the pillar', async () => {
    tx.resolveNext({ id: 42 }); // pillar lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({ tx, decoded: { name: 'MyPillar' } });
    await revoke(ctx);

    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 42 });
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: new Date('2024-01-01T00:00:00Z'), weight: '0' }),
    );
  });

  it('throws when the pillar is not found', async () => {
    tx.resolveNext(null); // pillar lookup

    const ctx = makeActionContext({ tx, decoded: { name: 'Unknown' } });
    await expect(revoke(ctx)).rejects.toThrow('Pillar.Revoke: pillar not found for Unknown');
  });
});
