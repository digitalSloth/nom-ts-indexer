import type { ActionContext, ActionHandler } from '../types.js';

export const createSpork: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  await tx('nom_sporks').insert({
    // The contract uses the CreateSpork send block hash as the spork id.
    hash: sendBlock.hash,
    account_block_id: sendBlock.id,
    name: String(decoded.name),
    description: String(decoded.description),
    is_active: false,
    created_at: receiveBlock.createdAt,
  });
};
