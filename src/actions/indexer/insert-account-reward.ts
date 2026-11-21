export type AccountRewardType =
  | 'pillar'
  | 'delegate'
  | 'stake'
  | 'sentinel'
  | 'liquidity'
  | 'liquidity_program'
  | 'bridge_affiliate';

export interface AccountReward {
  accountId: number;
  tokenId: number;
  accountBlockId: number;
  type: AccountRewardType;
  amount: string;
  createdAt: Date;
}

/**
 * Record one reward in nom_account_rewards. Callers run inside the
 * transaction that produces the reward, so a re-run of the same block never
 * reaches this point twice.
 */
export async function insertAccountReward(tx: any, reward: AccountReward): Promise<void> {
  await tx('nom_account_rewards').insert({
    account_id: reward.accountId,
    token_id: reward.tokenId,
    account_block_id: reward.accountBlockId,
    type: reward.type,
    amount: reward.amount,
    created_at: reward.createdAt,
  });
}
