import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';

export const fuse: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.address) {
    throw new Error('Plasma.Fuse: missing address');
  }
  if (sendBlock.amount === '0') {
    console.warn('Plasma.Fuse: amount is zero, skipping');
    return;
  }

  const existing = await tx('nom_plasma')
    .where({ account_block_id: sendBlock.id })
    .select('id')
    .first();
  if (existing) {
    return;
  }

  const toAccountId = await accountRegistry.getOrCreate(tx, decoded.address.toString());

  await tx('nom_plasma')
    .insert({
      from_account_id: sendBlock.accountId,
      to_account_id: toAccountId,
      account_block_id: sendBlock.id,
      amount: sendBlock.amount,
      started_at: receiveBlock.createdAt,
    })
    .returning('*');
};
