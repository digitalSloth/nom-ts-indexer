import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor, buildersFor } from '../bridge/helpers.js';

const { emergency } = await import('../../../../src/actions/process/liquidity/emergency.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('liquidity emergency', () => {
  it('revokes the liquidity administrator and halts', async () => {
    const tx = makeMockTx();

    await emergency(makeActionContext({ tx, receiveBlock: { createdAt: CREATED_AT } }));

    const [admins] = buildersFor(tx, 'nom_liquidity_admins');
    expect(admins.update).toHaveBeenCalledWith({ revoked_at: CREATED_AT });
    expect(argsFor(tx, 'nom_liquidity_settings', 'update')).toEqual([
      { is_halted: true, updated_at: CREATED_AT },
    ]);
    expect(buildersFor(tx, 'nom_bridge_admins')).toEqual([]);
  });
});
