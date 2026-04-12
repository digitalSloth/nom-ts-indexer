import type { ActionContext, ActionHandler } from '../types.js';
import { assertBridgeAdmin } from './admin.js';

export const revokeUnwrapRequest: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.transactionHash || decoded.logIndex === undefined) {
    throw new Error('Bridge.RevokeUnwrapRequest: missing required fields');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'RevokeUnwrapRequest'))) return;

  const unwrap = await tx('nom_bridge_unwraps')
    .where({
      transaction_hash: decoded.transactionHash as string,
      log_index: BigInt(decoded.logIndex),
    })
    .select('id')
    .first();
  if (!unwrap) {
    console.warn('Bridge.RevokeUnwrapRequest: unwrap not found');
    return;
  }

  await tx('nom_bridge_unwraps')
    .where({ id: unwrap.id })
    .update({ revoked_at: receiveBlock.createdAt });
};
