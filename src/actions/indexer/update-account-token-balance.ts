/**
 * Atomically update a token balance in the nom_account_tokens pivot table.
 * Reads the current balance, applies the delta, and upserts.
 */
export async function updateAccountTokenBalance(
  tx: any,
  accountId: number,
  tokenId: number,
  delta: bigint,
  timestamp: Date
): Promise<void> {
  const existing = await tx('nom_account_tokens')
    .where({ account_id: accountId, token_id: tokenId })
    .select('balance')
    .first();

  const currentBalance = existing ? BigInt(existing.balance) : 0n;
  const newBalance = (currentBalance + delta).toString();

  await tx('nom_account_tokens')
    .insert({
      account_id: accountId,
      token_id: tokenId,
      balance: newBalance,
      updated_at: timestamp,
    })
    .onConflict(['account_id', 'token_id'])
    .merge({ balance: newBalance, updated_at: timestamp });
}
