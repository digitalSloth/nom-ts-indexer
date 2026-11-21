import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { retrieveAssets } = await import('../../../../src/actions/process/swap/retrieve-assets.js');

const PUBLIC_KEY =
  'BHi+EHYlLtDxjEXAWlu6pQTpat9iVYfR6H3O8/ECTypQNySnlPhbKetptlTX2bhzq4hOwYncv/E+QcibP4Kab0A=';
const KEY_ID_HASH = '5217df3d860b53564398b62f002ffc9df4e727c724bed43b1ce3e45bd615141b';
const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const QSR = 'zts1qsrxxxxxxxxxxxxxmrhjll';

function mint(tokenStandard: string, amount: string) {
  return { decoded: JSON.stringify({ tokenStandard, amount, receiveAddress: 'z1qsender' }) };
}

describe('retrieveAssets', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  function ctx() {
    return makeActionContext({
      tx,
      sendBlock: { id: 20, accountId: 7 },
      receiveBlock: { id: 21, createdAt: new Date('2022-01-01T00:00:00Z') },
      decoded: { publicKey: PUBLIC_KEY, signature: 'sig' },
    });
  }

  it('records the amounts paid by the descendant mints', async () => {
    tx.resolveNext({ id: 4 }); // entry lookup
    tx.resolveNext([mint(ZNN, '8028688634'), mint(QSR, '1500')]); // descendant mints
    tx.resolveNext({}); // update

    await retrieveAssets(ctx());

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({ key_id_hash: KEY_ID_HASH });
    expect(tx.mock.results[1].value.where).toHaveBeenCalledWith('ab.parent_id', 21);
    const update = tx.mock.results[2].value;
    expect(update.where).toHaveBeenCalledWith({ id: 4 });
    expect(update.update).toHaveBeenCalledWith({
      account_id: 7,
      account_block_id: 20,
      public_key: PUBLIC_KEY,
      retrieved_znn: '8028688634',
      retrieved_qsr: '1500',
      retrieved_at: new Date('2022-01-01T00:00:00Z'),
    });
  });

  it('records zero for a token with no mint', async () => {
    tx.resolveNext({ id: 4 }); // entry lookup
    tx.resolveNext([mint(ZNN, '13238896748')]); // descendant mints
    tx.resolveNext({}); // update

    await retrieveAssets(ctx());

    expect(tx.mock.results[2].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ retrieved_znn: '13238896748', retrieved_qsr: '0' }),
    );
  });

  it('throws when the key has no genesis swap entry', async () => {
    tx.resolveNext(null); // entry lookup

    await expect(retrieveAssets(ctx())).rejects.toThrow(
      `Swap.RetrieveAssets: swap entry not found for ${KEY_ID_HASH}`,
    );
  });
});
