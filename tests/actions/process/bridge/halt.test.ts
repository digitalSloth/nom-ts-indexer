import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';

const { halt } = await import('../../../../src/actions/process/bridge/halt.js');

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('halt', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = (senderId: number) =>
    halt(
      makeActionContext({
        tx,
        decoded: { signature: 'sig' },
        sendBlock: { accountId: senderId },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('halts without using a TSS nonce when the administrator calls', async () => {
    tx.resolveNext({ account_id: 3 }); // active administrator

    await run(3);

    expect(argsFor(tx, 'nom_bridge_settings', 'update')).toEqual([
      { is_halted: true, halted_at: CREATED_AT, updated_at: CREATED_AT },
    ]);
    expect(tx.raw).not.toHaveBeenCalled();
  });

  it('uses up a TSS nonce when anyone else halts with a signature', async () => {
    tx.resolveNext({ account_id: 3 });

    await run(9);

    const [fields] = argsFor(tx, 'nom_bridge_settings', 'update');
    expect(Object.keys(fields)).toEqual(['is_halted', 'halted_at', 'tss_nonce', 'updated_at']);
    expect(tx.raw).toHaveBeenCalledWith('?? + 1', ['tss_nonce']);
  });

  it('treats every caller as a TSS signer while there is no administrator', async () => {
    tx.resolveNext(null);

    await run(3);

    expect(tx.raw).toHaveBeenCalledWith('?? + 1', ['tss_nonce']);
  });
});
