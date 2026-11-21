import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { ZNN_TOKEN_STANDARD } from '../../../../src/constants/zenon.js';
import { argsFor } from './helpers.js';

const { wrapToken } = await import('../../../../src/actions/process/bridge/wrap-token.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('wrapToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = () =>
    wrapToken(
      makeActionContext({
        tx,
        decoded: { networkClass: 2, chainId: 1, toAddress: '0xABCdef' },
        sendBlock: { id: 10, accountId: 1, tokenId: 4, amount: '500' },
        receiveBlock: { createdAt: CREATED_AT },
        frontierMomentum: { height: 4000n },
      }),
    );

  it('records the wrap and adds to the network ZNN totals', async () => {
    tx.resolveNext({ id: 7 }); // network
    tx.resolveNext({ fee_percentage: 150 }); // token pair
    tx.resolveNext({}); // insert wrap
    tx.resolveNext({ token_standard: ZNN_TOKEN_STANDARD }); // token

    await run();

    expect(argsFor(tx, 'nom_bridge_wraps', 'insert')).toEqual([
      {
        bridge_network_id: 7,
        account_id: 1,
        token_id: 4,
        account_block_id: 10,
        to_address: '0xabcdef',
        amount: '500',
        fee: '7', // 500 * 150 / 10000 = 7.5, rounded down
        creation_momentum_height: 4000n,
        created_at: CREATED_AT,
      },
    ]);
    const [totals] = argsFor(tx, 'nom_bridge_networks', 'update');
    expect(Object.keys(totals)).toEqual(['total_znn_wrapped', 'total_znn_held', 'updated_at']);
    expect(tx.raw).toHaveBeenCalledWith(`(COALESCE(??, '0')::numeric + ?::numeric)::text`, [
      'total_znn_held',
      '500',
    ]);
  });

  it('leaves network totals alone for other tokens', async () => {
    tx.resolveNext({ id: 7 });
    tx.resolveNext({ fee_percentage: 0 });
    tx.resolveNext({});
    tx.resolveNext({ token_standard: 'zts1other' });

    await run();

    expect(argsFor(tx, 'nom_bridge_networks', 'update')).toEqual([]);
  });

  it('throws when the network is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.WrapToken: network not found for 2/1');
  });

  it('throws when the token pair is not found', async () => {
    tx.resolveNext({ id: 7 });
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.WrapToken: token pair not found for token 4');
  });
});
