import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { createSpork } = await import('../../../../src/actions/process/spork/create-spork.js');

describe('createSpork', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('records an inactive spork keyed by its send block hash', async () => {
    const ctx = makeActionContext({
      tx,
      sendBlock: { id: 12, hash: 'ceb7e380' },
      decoded: { name: 'Hashed Timelock Contract', description: 'Hyperspace Program Atomic Swaps' },
    });
    await createSpork(ctx);

    expect(tx).toHaveBeenCalledWith('nom_sporks');
    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith({
      hash: 'ceb7e380',
      account_block_id: 12,
      name: 'Hashed Timelock Contract',
      description: 'Hyperspace Program Atomic Swaps',
      is_active: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });
});
