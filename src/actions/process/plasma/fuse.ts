import type { ActionContext, ActionHandler } from '../types.js';
import { FUSE_EXPIRATION_MOMENTUMS } from '../../../constants/zenon.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';

export const fuse: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock, frontierMomentum } = ctx;

  const toAccountId = await accountRegistry.getOrCreate(tx, decoded.address.toString());

  await tx('nom_plasma').insert({
    from_account_id: sendBlock.accountId,
    to_account_id: toAccountId,
    account_block_id: sendBlock.id,
    hash: sendBlock.hash,
    amount: sendBlock.amount,
    started_at: receiveBlock.createdAt,
    expiration_height: (frontierMomentum.height + FUSE_EXPIRATION_MOMENTUMS).toString(),
  });
};
