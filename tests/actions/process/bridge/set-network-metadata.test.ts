import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { setNetworkMetadata } =
  await import('../../../../src/actions/process/bridge/set-network-metadata.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('setNetworkMetadata', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = () =>
    setNetworkMetadata(
      makeActionContext({
        tx,
        decoded: { networkClass: 1, chainId: 1, metadata: '{"key":"value"}' },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('stores the metadata string as is', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_networks', 'update')).toEqual([
      { meta_data: '{"key":"value"}', updated_at: CREATED_AT },
    ]);
  });

  it('throws when the network is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.SetNetworkMetadata: network not found for 1/1');
  });
});
