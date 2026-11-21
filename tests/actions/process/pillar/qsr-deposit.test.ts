import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { depositQsr, withdrawQsr, consumeQsrDeposit } =
  await import('../../../../src/actions/process/pillar/qsr-deposit.js');

const AT = new Date('2024-01-01T00:00:00Z');

describe('QSR deposits', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  function ctx(amount = '500000000') {
    // Sender 1 calls contract account 2.
    return makeActionContext({ tx, sendBlock: { accountId: 1, toAccountId: 2, amount } });
  }

  describe('depositQsr', () => {
    it('creates the deposit for the contract that was called', async () => {
      tx.resolveNext(undefined); // deposit lookup
      tx.resolveNext({}); // insert

      await depositQsr(ctx());

      expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({
        account_id: 1,
        contract_account_id: 2,
      });
      expect(tx.mock.results[1].value.insert).toHaveBeenCalledWith({
        account_id: 1,
        contract_account_id: 2,
        amount: '500000000',
        updated_at: AT,
      });
    });

    it('adds to an existing deposit as numbers', async () => {
      tx.resolveNext({ id: 7, amount: '900000000' }); // deposit lookup
      tx.resolveNext({}); // update

      await depositQsr(ctx());

      const update = tx.mock.results[1].value;
      expect(update.where).toHaveBeenCalledWith({ id: 7 });
      expect(update.update).toHaveBeenCalledWith({ amount: '1400000000', updated_at: AT });
    });
  });

  describe('withdrawQsr', () => {
    it('deletes the deposit', async () => {
      tx.resolveNext({}); // delete

      await withdrawQsr(ctx('0'));

      const del = tx.mock.results[0].value;
      expect(del.where).toHaveBeenCalledWith({ account_id: 1, contract_account_id: 2 });
      expect(del.del).toHaveBeenCalled();
    });
  });

  describe('consumeQsrDeposit', () => {
    it('subtracts the cost and keeps the remainder', async () => {
      tx.resolveNext({ id: 7, amount: '900000000' }); // deposit lookup
      tx.resolveNext({}); // update

      await consumeQsrDeposit(ctx('0'), 'Test.Register', 400000000n);

      expect(tx.mock.results[1].value.update).toHaveBeenCalledWith({
        amount: '500000000',
        updated_at: AT,
      });
    });

    it('deletes the deposit when the cost uses all of it', async () => {
      tx.resolveNext({ id: 7, amount: '400000000' }); // deposit lookup
      tx.resolveNext({}); // delete

      await consumeQsrDeposit(ctx('0'), 'Test.Register', 400000000n);

      const del = tx.mock.results[1].value;
      expect(del.where).toHaveBeenCalledWith({ id: 7 });
      expect(del.del).toHaveBeenCalled();
    });

    it('throws when the account has no deposit', async () => {
      tx.resolveNext(undefined); // deposit lookup

      await expect(consumeQsrDeposit(ctx('0'), 'Test.Register', 1n)).rejects.toThrow(
        'Test.Register: QSR deposit not found for account 1',
      );
    });
  });
});
