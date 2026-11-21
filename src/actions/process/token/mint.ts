import {
  LIQUIDITY_ADDRESS,
  PILLAR_ADDRESS,
  SENTINEL_ADDRESS,
  STAKE_ADDRESS,
} from 'znn-typescript-sdk';
import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import {
  insertAccountReward,
  type AccountRewardType,
} from '../../indexer/insert-account-reward.js';
import { updateAccountTokenBalance } from '../../indexer/update-account-token-balance.js';

const LIQUIDITY = LIQUIDITY_ADDRESS.toString();

// Embedded contracts whose mints are rewards. Pillar contract mints are
// split into pillar and delegate rewards by receiver.
const REWARD_ISSUERS: Record<string, AccountRewardType> = {
  [PILLAR_ADDRESS.toString()]: 'pillar',
  [STAKE_ADDRESS.toString()]: 'stake',
  [SENTINEL_ADDRESS.toString()]: 'sentinel',
  [LIQUIDITY]: 'liquidity',
};

export const mint: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const tokenStandard = decoded.tokenStandard.toString();
  const token = await tx('nom_tokens')
    .where({ token_standard: tokenStandard })
    .select('id', 'total_supply')
    .first();

  if (!token) {
    throw new Error(`Token.Mint: token not found for ${tokenStandard}`);
  }

  const amount = BigInt(decoded.amount.toString());
  const receiverId = await accountRegistry.getOrCreate(tx, decoded.receiveAddress.toString());

  await tx('nom_token_mints').insert({
    token_id: token.id,
    issuer_id: sendBlock.accountId,
    receiver_id: receiverId,
    account_block_id: sendBlock.id,
    amount: amount.toString(),
    created_at: receiveBlock.createdAt,
  });

  const newTotal = (BigInt(token.total_supply) + amount).toString();
  await tx('nom_tokens')
    .where({ id: token.id })
    .update({ total_supply: newTotal, updated_at: receiveBlock.createdAt });

  const rewardType = await resolveRewardType(
    tx,
    sendBlock.accountId,
    receiverId,
    decoded.receiveAddress.toString(),
  );
  if (rewardType) {
    await insertAccountReward(tx, {
      accountId: receiverId,
      tokenId: token.id,
      accountBlockId: sendBlock.id,
      type: rewardType,
      amount: amount.toString(),
      createdAt: receiveBlock.createdAt,
    });
  }

  // The contract adds the minted amount to its own balance, then sends it
  // to the receiver.
  await updateAccountTokenBalance(
    tx,
    sendBlock.toAccountId,
    token.id,
    amount,
    receiveBlock.createdAt,
  );
};

async function resolveRewardType(
  tx: any,
  issuerId: number,
  receiverId: number,
  receiverAddress: string,
): Promise<AccountRewardType | null> {
  // The liquidity contract mints to itself before paying out stakers.
  if (receiverAddress === LIQUIDITY) return null;

  const issuer = await tx('nom_accounts').where({ id: issuerId }).select('address').first();
  const type = issuer ? REWARD_ISSUERS[issuer.address] : undefined;
  if (!type) return null;

  if (type === 'pillar' && !(await isPillarWithdrawAccount(tx, receiverId))) {
    return 'delegate';
  }
  return type;
}

/**
 * True when the account is, or ever was, a pillar's withdraw address.
 */
async function isPillarWithdrawAccount(tx: any, accountId: number): Promise<boolean> {
  const current = await tx('nom_pillars')
    .where({ withdraw_account_id: accountId })
    .select('id')
    .first();
  if (current) return true;

  const former = await tx('nom_pillar_update_histories')
    .where({ withdraw_account_id: accountId })
    .select('id')
    .first();
  return Boolean(former);
}
