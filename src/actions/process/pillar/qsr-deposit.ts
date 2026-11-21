/**
 * QSR deposits held by the pillar and sentinel contracts. Each contract keeps
 * its own deposit per account and deletes it when it reaches zero, so a
 * missing row means no deposit.
 */
import type { ActionContext, ActionHandler } from '../types.js';

/** QSR a sentinel registration takes from the owner's deposit. */
export const SENTINEL_QSR_DEPOSIT_AMOUNT = 50_000n * 100_000_000n;

/** DepositQsr: adds the sent QSR to the sender's deposit in that contract. */
export const depositQsr: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  const deposit = await findDeposit(tx, sendBlock.accountId, sendBlock.toAccountId);
  if (deposit) {
    const amount = BigInt(deposit.amount) + BigInt(sendBlock.amount);
    await tx('nom_qsr_deposits')
      .where({ id: deposit.id })
      .update({ amount: amount.toString(), updated_at: receiveBlock.createdAt });
    return;
  }

  await tx('nom_qsr_deposits').insert({
    account_id: sendBlock.accountId,
    contract_account_id: sendBlock.toAccountId,
    amount: sendBlock.amount,
    updated_at: receiveBlock.createdAt,
  });
};

/** WithdrawQsr: the contract pays out the whole deposit and deletes it. */
export const withdrawQsr: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock } = ctx;

  await tx('nom_qsr_deposits')
    .where({ account_id: sendBlock.accountId, contract_account_id: sendBlock.toAccountId })
    .del();
};

/**
 * Takes the QSR a registration costs from the sender's deposit in the
 * contract it called, deleting the deposit when it reaches zero.
 */
export async function consumeQsrDeposit(
  ctx: ActionContext,
  method: string,
  amount: bigint,
): Promise<void> {
  const { tx, sendBlock, receiveBlock } = ctx;

  const deposit = await findDeposit(tx, sendBlock.accountId, sendBlock.toAccountId);
  if (!deposit) {
    throw new Error(`${method}: QSR deposit not found for account ${sendBlock.accountId}`);
  }

  const remaining = BigInt(deposit.amount) - amount;
  if (remaining === 0n) {
    await tx('nom_qsr_deposits').where({ id: deposit.id }).del();
    return;
  }
  await tx('nom_qsr_deposits')
    .where({ id: deposit.id })
    .update({ amount: remaining.toString(), updated_at: receiveBlock.createdAt });
}

async function findDeposit(
  tx: any,
  accountId: number,
  contractAccountId: number,
): Promise<{ id: number; amount: string } | undefined> {
  return tx('nom_qsr_deposits')
    .where({ account_id: accountId, contract_account_id: contractAccountId })
    .select('id', 'amount')
    .first();
}
