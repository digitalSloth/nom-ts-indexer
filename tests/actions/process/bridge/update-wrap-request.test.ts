import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { buildersFor, argsFor } from './helpers.js';

const { updateWrapRequest } =
  await import('../../../../src/actions/process/bridge/update-wrap-request.js');

describe('updateWrapRequest', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = () =>
    updateWrapRequest(makeActionContext({ tx, decoded: { id: '0xabc123', signature: 'sig' } }));

  it('finds the wrap by its send block hash without the 0x prefix and stores the signature', async () => {
    tx.resolveNext({ id: 5 });
    tx.resolveNext({});

    await run();

    const [lookup] = buildersFor(tx, 'nom_bridge_wraps');
    expect(lookup.where).toHaveBeenCalledWith({ 'nom_account_blocks.hash': 'abc123' });
    expect(argsFor(tx, 'nom_bridge_wraps', 'update')[0]).toMatchObject({ signature: 'sig' });
  });

  it('throws when the wrap is not found', async () => {
    tx.resolveNext(null);
    await expect(run()).rejects.toThrow('Bridge.UpdateWrapRequest: wrap not found for abc123');
  });
});
