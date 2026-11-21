import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { removeNetwork } = await import('../../../../src/actions/process/bridge/remove-network.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('removeNetwork', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = () =>
    removeNetwork(
      makeActionContext({
        tx,
        decoded: { networkClass: 1, chainId: 1 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('soft-deletes the network', async () => {
    tx.resolveNext({ id: 10 });
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_networks', 'update')).toEqual([{ deleted_at: CREATED_AT }]);
  });

  it('throws when the network is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.RemoveNetwork: network not found for 1/1');
  });
});
