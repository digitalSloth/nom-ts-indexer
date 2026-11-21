import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { BRIDGE_SOFT_DELAY } from '../../../../src/constants/zenon.js';
import { argsFor } from './helpers.js';

const passTimeChallenge = vi.fn();
vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  passTimeChallenge: (...args: any[]) => passTimeChallenge(...args),
}));

const getOrLoad = vi.fn();
vi.mock('../../../../src/services/registries/token-registry.js', () => ({
  tokenRegistry: { getOrLoad: (...args: any[]) => getOrLoad(...args) },
}));

const { setTokenPair } = await import('../../../../src/actions/process/bridge/set-token-pair.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');
const decoded = {
  networkClass: 2,
  chainId: 1,
  tokenStandard: 'zts1test',
  tokenAddress: '0xABC',
  bridgeable: true,
  redeemable: true,
  owned: false,
  minAmount: '1000',
  feePercentage: 100,
  redeemDelay: 40,
  metadata: '{}',
};

describe('setTokenPair', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    passTimeChallenge.mockReset();
    getOrLoad.mockReset();
    getOrLoad.mockResolvedValue(4);
  });

  const run = () =>
    setTokenPair(makeActionContext({ tx, decoded, receiveBlock: { createdAt: CREATED_AT } }));

  it('only starts the time challenge on the first call', async () => {
    passTimeChallenge.mockResolvedValue(false);

    await run();

    expect(passTimeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ contractName: 'Bridge Contract' }),
      'SetTokenPair',
      expect.stringContaining('"tokenAddress":"0xabc"'),
      BRIDGE_SOFT_DELAY,
    );
    expect(tx).not.toHaveBeenCalled();
  });

  it('inserts a new pair with a lower-case token address once the challenge passes', async () => {
    passTimeChallenge.mockResolvedValue(true);
    tx.resolveNext({ id: 7 }); // network
    tx.resolveNext(null); // no existing pair
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_network_tokens', 'insert')).toEqual([
      {
        bridge_network_id: 7,
        token_id: 4,
        token_address: '0xabc',
        min_amount: '1000',
        fee_percentage: 100,
        redeem_delay: 40,
        metadata: '{}',
        is_bridgeable: true,
        is_redeemable: true,
        is_owned: false,
        updated_at: CREATED_AT,
        created_at: CREATED_AT,
      },
    ]);
  });

  it('replaces the existing pair for the same token or address', async () => {
    passTimeChallenge.mockResolvedValue(true);
    tx.resolveNext({ id: 7 });
    tx.resolveNext({ id: 12 });
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_network_tokens', 'insert')).toEqual([]);
    expect(argsFor(tx, 'nom_bridge_network_tokens', 'update')[0]).toMatchObject({
      token_id: 4,
      token_address: '0xabc',
    });
  });

  it('throws when the token cannot be loaded', async () => {
    passTimeChallenge.mockResolvedValue(true);
    tx.resolveNext({ id: 7 });
    getOrLoad.mockResolvedValue(null);

    await expect(run()).rejects.toThrow('Bridge.SetTokenPair: token not found for zts1test');
  });
});
