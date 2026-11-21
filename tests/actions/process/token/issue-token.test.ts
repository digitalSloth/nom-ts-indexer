import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

vi.mock('../../../../src/helpers/zts-from-hash.js', () => ({
  ztsFromHash: vi.fn(() => 'zts1newtokenxxxxxxxxxxx'),
}));

const { issueToken } = await import('../../../../src/actions/process/token/issue-token.js');

function balanceUpserts(tx: any): any[] {
  return tx.mock.calls
    .map((call: any[], i: number) => [call[0], tx.mock.results[i].value])
    .filter(([table]: [string]) => table === 'nom_account_tokens')
    .map(([, builder]: [string, any]) => builder.insert.mock.calls[0])
    .filter(Boolean)
    .map((args: any[]) => args[0]);
}

describe('issueToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    tokenName: 'MyToken',
    tokenSymbol: 'MTK',
    tokenDomain: 'example.com',
    totalSupply: '500000000000',
    maxSupply: '1000000000000',
    decimals: 8,
    isMintable: true,
    isBurnable: true,
    isUtility: false,
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('upserts the token on its standard with the issue values', async () => {
    tx.resolveNext({ id: 77 }); // upserted token id
    await issueToken(makeActionContext({ tx, decoded: defaultDecoded }));

    const builder = tx.mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith({
      owner_id: 1,
      name: 'MyToken',
      symbol: 'MTK',
      domain: 'example.com',
      token_standard: 'zts1newtokenxxxxxxxxxxx',
      total_supply: '500000000000',
      initial_supply: '500000000000',
      max_supply: '1000000000000',
      decimals: 8,
      is_mintable: true,
      is_burnable: true,
      is_utility: false,
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
    expect(builder.onConflict).toHaveBeenCalledWith('token_standard');
    expect(builder.merge).toHaveBeenCalled();
  });

  it('adds the issued supply to the token contract balance', async () => {
    tx.resolveNext({ id: 77 }); // upserted token id
    tx.resolveNext(null); // token contract balance lookup

    await issueToken(
      makeActionContext({ tx, decoded: defaultDecoded, sendBlock: { toAccountId: 3 } as any }),
    );

    expect(balanceUpserts(tx)).toEqual([
      {
        account_id: 3,
        token_id: 77,
        balance: '500000000000',
        sent: '0',
        received: '500000000000',
        updated_at: new Date('2024-01-01T00:00:00Z'),
      },
    ]);
  });
});
