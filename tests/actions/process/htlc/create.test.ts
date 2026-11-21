import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { create } = await import('../../../../src/actions/process/htlc/create.js');

describe('create', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockClear();
  });

  // Decoded args of mainnet HTLC 84367b2f...fd092 as the indexer stores them.
  it('records the HTLC keyed by its Create send block hash', async () => {
    const ctx = makeActionContext({
      tx,
      sendBlock: { hash: '84367b2f', accountId: 7, tokenId: 3, amount: '10000' },
      decoded: {
        hashLocked: 'z1qr3xxhly8jwhrfd5n85vv247g78edvpzzglyph',
        expirationTime: '1789003357',
        hashType: 1,
        keyMaxSize: 32,
        hashLock: '0x1FD8ECEF5782DA413B29AA89886EDA524FBF697B2BDFEA6315C779B7D2B2BB10',
      },
    });
    await create(ctx);

    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1qr3xxhly8jwhrfd5n85vv247g78edvpzzglyph');
    expect(tx).toHaveBeenCalledWith('nom_htlcs');
    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith({
      hash: '84367b2f',
      account_block_id: 10,
      time_locked_account_id: 7,
      hash_locked_account_id: 50,
      token_id: 3,
      amount: '10000',
      hash_type: 1,
      key_max_size: 32,
      hash_lock: '1fd8ecef5782da413b29aa89886eda524fbf697b2bdfea6315c779b7d2b2bb10',
      expires_at: new Date(1789003357 * 1000),
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });

  it('clamps an expiry beyond the storable range', async () => {
    const ctx = makeActionContext({
      tx,
      decoded: {
        hashLocked: 'z1qr3xxhly8jwhrfd5n85vv247g78edvpzzglyph',
        expirationTime: '9223372036854775807',
        hashType: 1,
        keyMaxSize: 32,
        hashLock: '0x01',
      },
    });
    await create(ctx);

    const row = tx.mock.results[0].value.insert.mock.calls[0][0];
    expect(row.expires_at).toEqual(new Date('9999-12-31T23:59:59Z'));
  });
});
