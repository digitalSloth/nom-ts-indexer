import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { create, createWithReclaimLock } =
  await import('../../../../src/actions/process/ptlc/create.js');
const { BURN_ADDRESS } = await import('../../../../src/constants/zenon.js');

const POINT = '0x1FD8ECEF5782DA413B29AA89886EDA524FBF697B2BDFEA6315C779B7D2B2BB10';
const POINT_BARE = '1fd8ecef5782da413b29aa89886eda524fbf697b2bdfea6315c779b7d2b2bb10';

describe('ptlc create', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockClear();
  });

  it('records the PTLC keyed by its Create send block hash', async () => {
    const ctx = makeActionContext({
      tx,
      sendBlock: { hash: '84367b2f', accountId: 7, tokenId: 3, amount: '10000' },
      decoded: {
        expirationTime: '1789003357',
        pointType: 1,
        pointLock: POINT,
        destination: 'z1qr3xxhly8jwhrfd5n85vv247g78edvpzzglyph',
      },
    });
    await create(ctx);

    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1qr3xxhly8jwhrfd5n85vv247g78edvpzzglyph');
    expect(tx).toHaveBeenCalledWith('nom_ptlcs');
    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith({
      hash: '84367b2f',
      account_block_id: 10,
      time_locked_account_id: 7,
      destination_account_id: 50,
      token_id: 3,
      amount: '10000',
      point_type: 1,
      point_lock: POINT_BARE,
      expires_at: new Date(1789003357 * 1000),
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });

  it('stores no destination when Create passed the zero address', async () => {
    const ctx = makeActionContext({
      tx,
      decoded: {
        expirationTime: '1789003357',
        pointType: 0,
        pointLock: POINT,
        destination: BURN_ADDRESS,
      },
    });
    await create(ctx);

    expect(getOrCreate).not.toHaveBeenCalled();
    const row = tx.mock.results[0].value.insert.mock.calls[0][0];
    expect(row.destination_account_id).toBeNull();
  });

  it('clamps an expiry beyond the storable range', async () => {
    const ctx = makeActionContext({
      tx,
      decoded: {
        expirationTime: '9223372036854775807',
        pointType: 0,
        pointLock: POINT,
        destination: BURN_ADDRESS,
      },
    });
    await create(ctx);

    const row = tx.mock.results[0].value.insert.mock.calls[0][0];
    expect(row.expires_at).toEqual(new Date('9999-12-31T23:59:59Z'));
  });

  it('CreateWithReclaimLock also stores the reclaim lock', async () => {
    const ctx = makeActionContext({
      tx,
      decoded: {
        expirationTime: '1789003357',
        pointType: 0,
        pointLock: POINT,
        destination: BURN_ADDRESS,
        reclaimPointType: 1,
        reclaimPointLock: '0xAB12',
      },
    });
    await createWithReclaimLock(ctx);

    const row = tx.mock.results[0].value.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      point_lock: POINT_BARE,
      reclaim_point_type: 1,
      reclaim_point_lock: 'ab12',
    });
  });
});
