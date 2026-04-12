import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';

export const mint: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.tokenStandard || !decoded.amount || !decoded.receiveAddress) {
    throw new Error('Token.Mint: missing tokenStandard, amount, or receiveAddress');
  }

  const tokenStandard = decoded.tokenStandard.toString();
  const token = await tx('nom_tokens')
    .where({ token_standard: tokenStandard })
    .select('id', 'total_supply')
    .first();

  if (!token) {
    console.warn(`Token.Mint: token "${tokenStandard}" not found, skipping`);
    return;
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
};
