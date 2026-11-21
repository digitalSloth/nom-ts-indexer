import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { setOrchestratorInfo } =
  await import('../../../../src/actions/process/bridge/set-orchestrator-info.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setOrchestratorInfo', () => {
  it('replaces the orchestrator settings', async () => {
    const tx = makeMockTx();
    await setOrchestratorInfo(
      makeActionContext({
        tx,
        // uint64 arrives as a string, uint32 as a number
        decoded: {
          windowSize: '6',
          keyGenThreshold: 20,
          confirmationsToFinality: 90,
          estimatedMomentumTime: 10,
        },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );
    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      {
        window_size: 6n,
        key_gen_threshold: 20n,
        confirmations_to_finality: 90n,
        estimated_momentum_time: 10n,
        updated_at: CREATED_AT,
      },
    ]);
  });
});
