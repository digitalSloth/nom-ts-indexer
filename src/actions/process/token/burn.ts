import type { ActionContext, ActionHandler } from '../types.js';

/**
 * Burn is unique: the ABI declares no decoded args. The amount and tokenId come
 * from the send block's own fields (sendBlock.amount + sendBlock.tokenId).
 */
export const burn: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  if (sendBlock.tokenId == null) {
    console.warn('Token.Burn: send block has no token, skipping');
    return;
  }

  const amount = BigInt(sendBlock.amount);
  if (amount <= 0n) {
    console.warn('Token.Burn: amount is zero, skipping');
    return;
  }

  const token = await tx('nom_tokens')
    .where({ id: sendBlock.tokenId })
    .select('id', 'total_supply', 'max_supply', 'is_mintable')
    .first();

  if (!token) {
    console.warn('Token.Burn: token not found, skipping');
    return;
  }

  await tx('nom_token_burns').insert({
    token_id: token.id,
    account_id: sendBlock.accountId,
    account_block_id: sendBlock.id,
    amount: amount.toString(),
    created_at: receiveBlock.createdAt,
  });

  const newTotal = (BigInt(token.total_supply) - amount).toString();
  const data: Record<string, any> = {
    total_supply: newTotal,
    updated_at: receiveBlock.createdAt,
  };
  if (!token.is_mintable) {
    data.max_supply = (BigInt(token.max_supply) - amount).toString();
  }

  await tx('nom_tokens').where({ id: token.id }).update(data);
};
