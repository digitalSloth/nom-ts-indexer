import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { burn } = await import('../../../../src/actions/process/token/burn.js');

function balanceUpserts(tx: any): any[] {
  return tx.mock.calls
    .map((call: any[], i: number) => [call[0], tx.mock.results[i].value])
    .filter(([table]: [string]) => table === 'nom_account_tokens')
    .map(([, builder]: [string, any]) => builder.insert.mock.calls[0])
    .filter(Boolean)
    .map((args: any[]) => args[0]);
}

describe('burn', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  function tokenUpdate() {
    return tx.mock.results[2].value.update.mock.calls[0][0];
  }

  const sendBlock = {
    id: 5,
    accountId: 1,
    toAccountId: 3,
    tokenId: 10,
    amount: '500000000',
  } as any;

  it('records the burn and lowers total_supply of a mintable token', async () => {
    tx.resolveNext({
      id: 10,
      total_supply: '1000000000',
      max_supply: '2000000000',
      is_mintable: true,
    });

    await burn(makeActionContext({ tx, sendBlock }));

    expect(tx.mock.results[1].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        token_id: 10,
        account_id: 1,
        account_block_id: 5,
        amount: '500000000',
      }),
    );
    expect(tokenUpdate()).toEqual({
      total_supply: '500000000',
      updated_at: new Date('2024-01-01T00:00:00Z'),
    });
  });

  it('takes the burned amount off the token contract balance', async () => {
    tx.resolveNext({
      id: 10,
      total_supply: '1000000000',
      max_supply: '2000000000',
      is_mintable: true,
    });
    tx.resolveNext(null); // nom_token_burns insert
    tx.resolveNext(null); // nom_tokens update
    tx.resolveNext({ balance: '700000000', sent: '0', received: '700000000' });

    await burn(makeActionContext({ tx, sendBlock }));

    expect(balanceUpserts(tx)).toEqual([
      {
        account_id: 3,
        token_id: 10,
        balance: '200000000',
        sent: '500000000',
        received: '700000000',
        updated_at: new Date('2024-01-01T00:00:00Z'),
      },
    ]);
  });

  it('lowers max_supply as well for a non-mintable token', async () => {
    tx.resolveNext({
      id: 10,
      total_supply: '1000000000',
      max_supply: '1000000000',
      is_mintable: false,
    });

    await burn(makeActionContext({ tx, sendBlock }));

    expect(tokenUpdate()).toMatchObject({ total_supply: '500000000', max_supply: '500000000' });
  });

  it('throws when the token is not indexed', async () => {
    tx.resolveNext(null);

    await expect(burn(makeActionContext({ tx, sendBlock }))).rejects.toThrow(
      'Token.Burn: token not found for id 10',
    );
  });
});
