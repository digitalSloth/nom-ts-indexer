import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { BRIDGE_SOFT_DELAY } from '../../../../src/constants/zenon.js';
import { argsFor, buildersFor } from '../bridge/helpers.js';

const passTimeChallenge = vi.fn();
vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  passTimeChallenge: (...args: any[]) => passTimeChallenge(...args),
}));

const getOrLoad = vi.fn();
vi.mock('../../../../src/services/registries/token-registry.js', () => ({
  tokenRegistry: { getOrLoad: (...args: any[]) => getOrLoad(...args) },
}));

const { setTokenTuple } =
  await import('../../../../src/actions/process/liquidity/set-token-tuple.js');
const { LIQUIDITY_GOVERNANCE } =
  await import('../../../../src/actions/process/bridge/governance.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');
const decoded = {
  tokenStandards: ['zts1first', 'zts1second'],
  znnPercentages: [6000, 4000],
  qsrPercentages: [5000, 5000],
  // uint256 arrives as a number or a string
  minAmounts: [1, '100000000000000000000'],
};

describe('setTokenTuple', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    passTimeChallenge.mockReset();
    getOrLoad.mockReset();
    getOrLoad.mockImplementation(async (_tx: any, standard: string) =>
      standard === 'zts1first' ? 11 : 12,
    );
  });

  const run = () =>
    setTokenTuple(makeActionContext({ tx, decoded, receiveBlock: { createdAt: CREATED_AT } }));

  it('only starts the time challenge on the first call, keeping the tuple order', async () => {
    passTimeChallenge.mockResolvedValue(false);

    await run();

    expect(passTimeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      LIQUIDITY_GOVERNANCE,
      'SetTokenTuple',
      JSON.stringify([
        { tokenStandard: 'zts1first', znnPercentage: 6000, qsrPercentage: 5000, minAmount: '1' },
        {
          tokenStandard: 'zts1second',
          znnPercentage: 4000,
          qsrPercentage: 5000,
          minAmount: '100000000000000000000',
        },
      ]),
      BRIDGE_SOFT_DELAY,
    );
    expect(tx).not.toHaveBeenCalled();
  });

  it('replaces every tuple once the challenge passes', async () => {
    passTimeChallenge.mockResolvedValue(true);

    await run();

    const [cleared] = buildersFor(tx, 'nom_liquidity_token_tuples');
    expect(cleared.del).toHaveBeenCalled();
    expect(argsFor(tx, 'nom_liquidity_token_tuples', 'insert')).toEqual([
      [
        {
          token_id: 11,
          znn_percentage: 6000,
          qsr_percentage: 5000,
          min_amount: '1',
          created_at: CREATED_AT,
        },
        {
          token_id: 12,
          znn_percentage: 4000,
          qsr_percentage: 5000,
          min_amount: '100000000000000000000',
          created_at: CREATED_AT,
        },
      ],
    ]);
  });

  it('throws when a token is not found', async () => {
    passTimeChallenge.mockResolvedValue(true);
    getOrLoad.mockResolvedValue(null);

    await expect(run()).rejects.toThrow('Liquidity.SetTokenTuple: token not found for zts1first');
  });
});
