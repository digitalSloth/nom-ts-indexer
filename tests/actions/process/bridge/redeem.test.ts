import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor } from './helpers.js';
import { QSR_TOKEN_STANDARD } from '../../../../src/constants/zenon.js';

const { redeem } = await import('../../../../src/actions/process/bridge/redeem.js');

const CREATED_AT = new Date('2024-03-01T00:00:00Z');

describe('redeem', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  const run = (logIndex: number) =>
    redeem(
      makeActionContext({
        tx,
        decoded: { transactionHash: '0xtxhash', logIndex },
        sendBlock: { id: 77 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  const unwrap = (logIndex: string) => ({
    id: 42,
    bridge_network_id: 9,
    to_account_id: 7,
    token_id: 2,
    log_index: logIndex,
    amount: '2500',
  });

  it('marks the unwrap as redeemed', async () => {
    tx.resolveNext(unwrap('0'));
    tx.resolveNext({});

    await run(0);

    expect(argsFor(tx, 'nom_bridge_unwraps', 'update')).toEqual([
      { redeemed_at: CREATED_AT, updated_at: CREATED_AT },
    ]);
    expect(argsFor(tx, 'nom_account_rewards', 'insert')).toEqual([]);
  });

  it('counts the redeemed unwrap in the network totals', async () => {
    tx.resolveNext(unwrap('0'));
    tx.resolveNext({}); // redeem
    tx.resolveNext({ token_standard: QSR_TOKEN_STANDARD }); // totals token lookup
    tx.resolveNext({}); // totals update

    await run(0);

    const [totals] = argsFor(tx, 'nom_bridge_networks', 'update');
    expect(Object.keys(totals)).toEqual(['total_qsr_unwrapped', 'total_qsr_held', 'updated_at']);
    expect(tx.raw).toHaveBeenCalledWith(`(COALESCE(??, '0')::numeric + ?::numeric)::text`, [
      'total_qsr_unwrapped',
      '2500',
    ]);
    expect(tx.raw).toHaveBeenCalledWith(`(COALESCE(??, '0')::numeric - ?::numeric)::text`, [
      'total_qsr_held',
      '2500',
    ]);
  });

  it('records a reward for the unwrap receiver when the log index is above 4000000000', async () => {
    tx.resolveNext(unwrap('4000000123'));
    tx.resolveNext({});
    tx.resolveNext({});

    await run(4000000123);

    expect(argsFor(tx, 'nom_account_rewards', 'insert')).toEqual([
      {
        account_id: 7,
        token_id: 2,
        account_block_id: 77,
        type: 'bridge_affiliate',
        amount: '2500',
        created_at: CREATED_AT,
      },
    ]);
  });

  it('records no reward for an unwrap at log index 4000000000', async () => {
    tx.resolveNext(unwrap('4000000000'));
    tx.resolveNext({});

    await run(4000000000);

    expect(argsFor(tx, 'nom_account_rewards', 'insert')).toEqual([]);
  });

  it('throws when the unwrap is not found', async () => {
    tx.resolveNext(null);
    await expect(run(3)).rejects.toThrow('Bridge.Redeem: unwrap not found for 0xtxhash/3');
  });
});
