import type { ActionContext, ActionHandler } from '../types.js';

export const undelegate: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  await tx('nom_delegations')
    .where({ account_id: sendBlock.accountId, ended_at: null })
    .update({ ended_at: receiveBlock.createdAt });
};
