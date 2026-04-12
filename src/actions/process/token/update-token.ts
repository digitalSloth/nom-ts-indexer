import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';

export const updateToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.tokenStandard || !decoded.owner) {
    throw new Error('Token.UpdateToken: missing tokenStandard or owner');
  }

  const tokenStandard = decoded.tokenStandard.toString();
  const token = await tx('nom_tokens')
    .where({ token_standard: tokenStandard })
    .select('id', 'owner_id', 'is_mintable', 'total_supply')
    .first();

  if (!token) {
    console.warn(`Token.UpdateToken: token "${tokenStandard}" not found, skipping`);
    return;
  }
  if (token.owner_id !== sendBlock.accountId) {
    console.warn(`Token.UpdateToken: sender is not token owner, skipping`);
    return;
  }

  const newOwnerId = await accountRegistry.getOrCreate(tx, decoded.owner.toString());
  const newIsMintable = Boolean(decoded.isMintable);
  const newIsBurnable = Boolean(decoded.isBurnable);

  const data: Record<string, any> = {
    owner_id: newOwnerId,
    is_mintable: newIsMintable,
    is_burnable: newIsBurnable,
    updated_at: receiveBlock.createdAt,
  };

  // mintable → non-mintable: collapse max_supply down to current total_supply
  if (token.is_mintable && !newIsMintable) {
    data.max_supply = token.total_supply;
  }

  await tx('nom_tokens').where({ id: token.id }).update(data);
};
