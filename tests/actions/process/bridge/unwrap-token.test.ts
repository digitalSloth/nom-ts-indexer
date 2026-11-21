import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor, buildersFor } from './helpers.js';

const getOrCreate = vi.fn();
vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: { getOrCreate: (...args: any[]) => getOrCreate(...args) },
}));

const { unwrapToken } = await import('../../../../src/actions/process/bridge/unwrap-token.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('unwrapToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(33);
  });

  const run = () =>
    unwrapToken(
      makeActionContext({
        tx,
        decoded: {
          networkClass: 2,
          chainId: 1,
          transactionHash: '0xtx',
          logIndex: 4,
          toAddress: 'z1qrecipient',
          tokenAddress: '0xABC',
          amount: '900',
          signature: 'sig',
        },
        sendBlock: { id: 10, accountId: 1 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('records the unwrap for toAddress and leaves the network totals to the redeem', async () => {
    tx.resolveNext({ id: 7 }); // network
    tx.resolveNext({ token_id: 6 }); // token pair
    tx.resolveNext({}); // insert unwrap

    await run();

    const [pairLookup] = buildersFor(tx, 'nom_bridge_network_tokens');
    expect(pairLookup.where).toHaveBeenCalledWith({ bridge_network_id: 7, token_address: '0xabc' });
    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1qrecipient');
    expect(argsFor(tx, 'nom_bridge_unwraps', 'insert')).toEqual([
      {
        bridge_network_id: 7,
        to_account_id: 33,
        token_id: 6,
        account_block_id: 10,
        transaction_hash: '0xtx',
        log_index: 4n,
        signature: 'sig',
        amount: '900',
        created_at: CREATED_AT,
        updated_at: CREATED_AT,
      },
    ]);
    expect(argsFor(tx, 'nom_bridge_networks', 'update')).toEqual([]);
  });

  it('throws when the token pair is not found', async () => {
    tx.resolveNext({ id: 7 });
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.UnwrapToken: token pair not found for 0xabc');
  });

  it('throws when the network is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.UnwrapToken: network not found for 2/1');
  });
});
