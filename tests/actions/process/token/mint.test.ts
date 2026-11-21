import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LIQUIDITY_ADDRESS, PILLAR_ADDRESS, STAKE_ADDRESS } from 'znn-typescript-sdk';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { mint } = await import('../../../../src/actions/process/token/mint.js');

function balanceUpserts(tx: any): any[] {
  return tx.mock.calls
    .map((call: any[], i: number) => [call[0], tx.mock.results[i].value])
    .filter(([table]: [string]) => table === 'nom_account_tokens')
    .map(([, builder]: [string, any]) => builder.insert.mock.calls[0])
    .filter(Boolean)
    .map((args: any[]) => args[0]);
}

describe('mint', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    amount: '500000000',
    receiveAddress: 'z1qreceiver',
  };

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(50);
  });

  it('creates mint record and updates total_supply', async () => {
    tx.resolveNext({ id: 10, total_supply: '1000000000' }); // token lookup
    tx.resolveNext({}); // insert mint
    tx.resolveNext({}); // update token

    const ctx = makeActionContext({
      tx,
      decoded: defaultDecoded,
      sendBlock: { id: 5, accountId: 1 } as any,
    });
    await expect(mint(ctx)).resolves.toBeUndefined();
  });

  it('adds the minted amount to the token contract balance', async () => {
    tx.resolveNext({ id: 10, total_supply: '1000000000' }); // token lookup
    tx.resolveNext({}); // insert mint
    tx.resolveNext({}); // update token
    tx.resolveNext({ address: 'z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7' }); // issuer lookup
    tx.resolveNext(null); // token contract balance lookup

    await mint(
      makeActionContext({
        tx,
        decoded: defaultDecoded,
        sendBlock: { id: 5, accountId: 1, toAccountId: 3 } as any,
      }),
    );

    expect(balanceUpserts(tx)).toEqual([
      {
        account_id: 3,
        token_id: 10,
        balance: '500000000',
        sent: '0',
        received: '500000000',
        updated_at: new Date('2024-01-01T00:00:00Z'),
      },
    ]);
  });

  it('throws when the token is not indexed', async () => {
    tx.resolveNext(null);

    await expect(mint(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Token.Mint: token not found for zts1znnxxxxxxxxxxxxx9z4ulx',
    );
  });

  describe('rewards', () => {
    const QSR = 'zts1qsrxxxxxxxxxxxxxmrhjll';

    function rewardInserts(): any[] {
      return tx.mock.calls
        .map((call: any[], i: number) => [call[0], tx.mock.results[i].value])
        .filter(([table]: [string]) => table === 'nom_account_rewards')
        .map(([, builder]: [string, any]) => builder.insert.mock.calls[0][0]);
    }

    function queueMint(tokenId: number, issuerAddress: string): void {
      tx.resolveNext({ id: tokenId, total_supply: '0' }); // token lookup
      tx.resolveNext({}); // insert mint
      tx.resolveNext({}); // update token
      tx.resolveNext({ address: issuerAddress }); // issuer lookup
    }

    function runMint(decoded: Record<string, any> = defaultDecoded) {
      return mint(
        makeActionContext({
          tx,
          decoded,
          sendBlock: { id: 5, accountId: 1 } as any,
          receiveBlock: { createdAt: new Date('2024-02-01T00:00:00Z') } as any,
        }),
      );
    }

    it('records a pillar reward with the mint token and amount when the receiver is a pillar withdraw address', async () => {
      queueMint(10, PILLAR_ADDRESS.toString());
      tx.resolveNext({ id: 3 }); // nom_pillars match
      tx.resolveNext({}); // insert reward

      await runMint();

      expect(rewardInserts()).toEqual([
        {
          account_id: 50,
          token_id: 10,
          account_block_id: 5,
          type: 'pillar',
          amount: '500000000',
          created_at: new Date('2024-02-01T00:00:00Z'),
        },
      ]);
    });

    it('records a pillar reward when the receiver is a former withdraw address', async () => {
      queueMint(10, PILLAR_ADDRESS.toString());
      tx.resolveNext(null); // nom_pillars: no current match
      tx.resolveNext({ id: 8 }); // nom_pillar_update_histories match
      tx.resolveNext({}); // insert reward

      await runMint();

      expect(rewardInserts().map((r) => r.type)).toEqual(['pillar']);
    });

    it('records a delegate reward when the receiver was never a pillar withdraw address', async () => {
      queueMint(10, PILLAR_ADDRESS.toString());
      tx.resolveNext(null); // nom_pillars
      tx.resolveNext(null); // nom_pillar_update_histories
      tx.resolveNext({}); // insert reward

      await runMint();

      expect(rewardInserts().map((r) => r.type)).toEqual(['delegate']);
    });

    it('records a QSR stake reward from the mint call data', async () => {
      queueMint(11, STAKE_ADDRESS.toString());
      tx.resolveNext({}); // insert reward

      await runMint({
        tokenStandard: QSR,
        amount: '123456789012345678901234',
        receiveAddress: 'z1qreceiver',
      });

      expect(rewardInserts()).toEqual([
        expect.objectContaining({
          token_id: 11,
          type: 'stake',
          amount: '123456789012345678901234',
        }),
      ]);
    });

    it('records no reward when the liquidity contract mints to itself', async () => {
      queueMint(10, LIQUIDITY_ADDRESS.toString());

      await runMint({ ...defaultDecoded, receiveAddress: LIQUIDITY_ADDRESS.toString() });

      expect(rewardInserts()).toEqual([]);
    });

    it('records no reward for a mint by a token owner', async () => {
      queueMint(12, 'z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7');

      await runMint();

      expect(rewardInserts()).toEqual([]);
    });
  });
});
