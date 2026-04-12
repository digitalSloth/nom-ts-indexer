import type { ActionContext, ActionHandler } from '../types.js';
import { assertBridgeAdmin, findActiveBridgeNetwork } from './admin.js';

export const removeNetwork: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.networkClass || !decoded.chainId) {
    throw new Error('Bridge.RemoveNetwork: missing required fields');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'RemoveNetwork'))) return;

  const network = await findActiveBridgeNetwork(tx, decoded.networkClass, decoded.chainId);
  if (!network) {
    console.warn('Bridge.RemoveNetwork: network not found');
    return;
  }

  await tx('nom_bridge_networks')
    .where({ id: network.id })
    .update({ deleted_at: receiveBlock.createdAt });
};
