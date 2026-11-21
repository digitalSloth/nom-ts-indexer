import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from '../bridge/helpers.js';

const { setIsHalted } = await import('../../../../src/actions/process/liquidity/set-is-halted.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setIsHalted', () => {
  it('stores the halt flag', async () => {
    const tx = makeMockTx();
    await setIsHalted(
      makeActionContext({
        tx,
        decoded: { isHalted: true },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );
    expect(argsFor(tx, 'nom_liquidity_settings', 'update')).toEqual([
      { is_halted: true, updated_at: CREATED_AT },
    ]);
  });
});
