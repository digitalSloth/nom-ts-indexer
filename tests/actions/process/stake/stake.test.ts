import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { stake } = await import('../../../../src/actions/process/stake/stake.js');

describe('stake', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('records the stake from the send block', async () => {
    tx.resolveNext({}); // insert

    const ctx = makeActionContext({ tx, decoded: { durationInSec: '2592000' } });
    await stake(ctx);

    expect(tx).toHaveBeenCalledWith('nom_stakes');
    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith({
      account_id: 1,
      token_id: 1,
      account_block_id: 10,
      amount: '100000000',
      duration: 2592000n,
      started_at: new Date('2024-01-01T00:00:00Z'),
      expires_at: new Date('2024-01-31T00:00:00Z'),
    });
  });
});
