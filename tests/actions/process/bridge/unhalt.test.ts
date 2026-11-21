import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { unhalt } = await import('../../../../src/actions/process/bridge/unhalt.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('unhalt', () => {
  it('clears the halt and records the frontier height the unhalt delay counts from', async () => {
    const tx = makeMockTx();

    await unhalt(
      makeActionContext({
        tx,
        receiveBlock: { createdAt: CREATED_AT },
        frontierMomentum: { height: 5000n },
      }),
    );

    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      {
        is_halted: false,
        unhalted_at_height: 5000n,
        unhalted_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
    ]);
  });
});
