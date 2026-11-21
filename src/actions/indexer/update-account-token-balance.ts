import { applyDelegatorBalanceChange } from './pillar-metrics.js';

/**
 * Atomically update a token balance in the nom_account_tokens pivot table.
 * Reads the current row, applies the delta, and upserts. A negative delta
 * adds to the lifetime `sent` total, a positive one to `received`. A ZNN
 * change of a delegating account also moves its pillar's weight.
 */
export async function updateAccountTokenBalance(
  tx: any,
  accountId: number,
  tokenId: number,
  delta: bigint,
  timestamp: Date,
): Promise<void> {
  const existing = await tx('nom_account_tokens')
    .where({ account_id: accountId, token_id: tokenId })
    .select('balance', 'sent', 'received')
    .first();

  const balance = (BigInt(existing?.balance ?? 0) + delta).toString();
  const sent = (BigInt(existing?.sent ?? 0) + (delta < 0n ? -delta : 0n)).toString();
  const received = (BigInt(existing?.received ?? 0) + (delta > 0n ? delta : 0n)).toString();

  await tx('nom_account_tokens')
    .insert({
      account_id: accountId,
      token_id: tokenId,
      balance,
      sent,
      received,
      updated_at: timestamp,
    })
    .onConflict(['account_id', 'token_id'])
    .merge({ balance, sent, received, updated_at: timestamp });

  await applyDelegatorBalanceChange(tx, accountId, tokenId, delta);
}
