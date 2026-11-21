import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { buildersFor } from './helpers.js';

const getOrLoad = vi.fn();
vi.mock('../../../../src/services/registries/token-registry.js', () => ({
  tokenRegistry: { getOrLoad: (...args: any[]) => getOrLoad(...args) },
}));

const { removeTokenPair } =
  await import('../../../../src/actions/process/bridge/remove-token-pair.js');

describe('removeTokenPair', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrLoad.mockReset();
    getOrLoad.mockResolvedValue(4);
  });

  const run = () =>
    removeTokenPair(
      makeActionContext({
        tx,
        decoded: { networkClass: 2, chainId: 1, tokenStandard: 'zts1test', tokenAddress: '0xabc' },
      }),
    );

  it('deletes the token pair', async () => {
    tx.resolveNext({ id: 7 });
    tx.resolveNext({});

    await run();

    const [pair] = buildersFor(tx, 'nom_bridge_network_tokens');
    expect(pair.where).toHaveBeenCalledWith({ bridge_network_id: 7, token_id: 4 });
    expect(pair.del).toHaveBeenCalled();
  });

  it('throws when the network is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.RemoveTokenPair: network not found for 2/1');
  });
});
