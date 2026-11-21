import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor, buildersFor } from './helpers.js';

const { setNetwork } = await import('../../../../src/actions/process/bridge/set-network.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setNetwork', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = () =>
    setNetwork(
      makeActionContext({
        tx,
        decoded: {
          networkClass: 2,
          chainId: 1,
          name: 'Ethereum',
          contractAddress: '0xabc',
          metadata: '{"a":1}',
        },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('creates a new network and stores the metadata string as is', async () => {
    tx.resolveNext(null); // no existing network
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_networks', 'insert')).toEqual([
      {
        network_class: 2n,
        chain_identifier: 1n,
        name: 'Ethereum',
        contract_address: '0xabc',
        meta_data: '{"a":1}',
        created_at: CREATED_AT,
      },
    ]);
  });

  it('replaces an existing network and clears its token pairs', async () => {
    tx.resolveNext({ id: 9 });
    tx.resolveNext({});
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_networks', 'update')).toEqual([
      {
        name: 'Ethereum',
        contract_address: '0xabc',
        meta_data: '{"a":1}',
        updated_at: CREATED_AT,
        deleted_at: null,
      },
    ]);
    const [tokens] = buildersFor(tx, 'nom_bridge_network_tokens');
    expect(tokens.where).toHaveBeenCalledWith({ bridge_network_id: 9 });
    expect(tokens.del).toHaveBeenCalled();
  });
});
