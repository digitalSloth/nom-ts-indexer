import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { BRIDGE_SOFT_DELAY } from '../../../../src/constants/zenon.js';
import { argsFor } from '../bridge/helpers.js';

const passTimeChallenge = vi.fn();
vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  passTimeChallenge: (...args: any[]) => passTimeChallenge(...args),
}));

const { setAdditionalReward } =
  await import('../../../../src/actions/process/liquidity/set-additional-reward.js');
const { LIQUIDITY_GOVERNANCE } =
  await import('../../../../src/actions/process/bridge/governance.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setAdditionalReward', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    passTimeChallenge.mockReset();
  });

  const run = () =>
    setAdditionalReward(
      makeActionContext({
        tx,
        decoded: { znnReward: '500000000000', qsrReward: 0 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('only starts the time challenge on the first call', async () => {
    passTimeChallenge.mockResolvedValue(false);

    await run();

    expect(passTimeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      LIQUIDITY_GOVERNANCE,
      'SetAdditionalReward',
      '500000000000,0',
      BRIDGE_SOFT_DELAY,
    );
    expect(tx).not.toHaveBeenCalled();
  });

  it('stores the rewards once the challenge passes', async () => {
    passTimeChallenge.mockResolvedValue(true);

    await run();

    expect(argsFor(tx, 'nom_liquidity_settings', 'update')).toEqual([
      { znn_reward: '500000000000', qsr_reward: '0', updated_at: CREATED_AT },
    ]);
  });
});
