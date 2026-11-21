import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';

export const updateToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const tokenStandard = decoded.tokenStandard.toString();
  const token = await tx('nom_tokens')
    .where({ token_standard: tokenStandard })
    .select('id', 'is_mintable', 'total_supply')
    .first();

  if (!token) {
    throw new Error(`Token.UpdateToken: token not found for ${tokenStandard}`);
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

  // Mintable to non-mintable: max_supply drops to the current total_supply
  if (token.is_mintable && !newIsMintable) {
    data.max_supply = token.total_supply;
  }

  await tx('nom_tokens').where({ id: token.id }).update(data);
};
