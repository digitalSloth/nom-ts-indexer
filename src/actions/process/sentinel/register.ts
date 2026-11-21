import type { ActionContext, ActionHandler } from '../types.js';
import { consumeQsrDeposit, SENTINEL_QSR_DEPOSIT_AMOUNT } from '../pillar/qsr-deposit.js';

export const register: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  await tx('nom_sentinels').insert({
    owner_id: sendBlock.accountId,
    created_at: receiveBlock.createdAt,
  });

  await consumeQsrDeposit(ctx, 'Sentinel.Register', SENTINEL_QSR_DEPOSIT_AMOUNT);
};
