import type { ActionContext, ActionHandler } from '../types.js';
import { assertBridgeAdmin, findActiveBridgeNetwork } from './admin.js';

export const setNetworkMetadata: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.networkClass || !decoded.chainId || decoded.metadata === undefined) {
    throw new Error('Bridge.SetNetworkMetadata: missing required fields');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'SetNetworkMetadata'))) return;

  const network = await findActiveBridgeNetwork(tx, decoded.networkClass, decoded.chainId);
  if (!network) {
    console.warn('Bridge.SetNetworkMetadata: network not found');
    return;
  }

  await tx('nom_bridge_networks')
    .where({ id: network.id })
    .update({
      meta_data:
        typeof decoded.metadata === 'string' ? decoded.metadata : JSON.stringify(decoded.metadata),
      updated_at: receiveBlock.createdAt,
    });
};
