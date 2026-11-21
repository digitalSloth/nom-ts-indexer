import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { fuse } = await import('../../../../src/actions/process/plasma/fuse.js');

describe('fuse', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(50);
  });

  it('creates a plasma record for the beneficiary', async () => {
    tx.resolveNext({}); // insert

    const ctx = makeActionContext({ tx, decoded: { address: 'z1qbeneficiary' } });
    await fuse(ctx);

    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1qbeneficiary');
    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith({
      from_account_id: 1,
      to_account_id: 50,
      account_block_id: 10,
      hash: 'sendblockhash123',
      amount: '100000000',
      started_at: new Date('2024-01-01T00:00:00Z'),
      expiration_height: '4600',
    });
  });
});
