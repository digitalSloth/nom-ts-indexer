import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { revokeUnwrapRequest } =
  await import('../../../../src/actions/process/bridge/revoke-unwrap-request.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('revokeUnwrapRequest', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = () =>
    revokeUnwrapRequest(
      makeActionContext({
        tx,
        decoded: { transactionHash: '0xhash', logIndex: 1 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('marks the unwrap as revoked and leaves the network totals', async () => {
    tx.resolveNext({ id: 5 });
    tx.resolveNext({});

    await run();

    expect(argsFor(tx, 'nom_bridge_unwraps', 'update')).toEqual([
      { revoked_at: CREATED_AT, updated_at: CREATED_AT },
    ]);
    expect(argsFor(tx, 'nom_bridge_networks', 'update')).toEqual([]);
  });

  it('throws when the unwrap is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow(
      'Bridge.RevokeUnwrapRequest: unwrap not found for 0xhash/1',
    );
  });
});
