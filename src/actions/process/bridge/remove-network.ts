import type { ActionContext, ActionHandler } from '../types.js';
import { requireBridgeNetwork } from './network.js';

export const removeNetwork: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const networkId = await requireBridgeNetwork(
    tx,
    'RemoveNetwork',
    decoded.networkClass,
    decoded.chainId,
  );

  await tx('nom_bridge_networks')
    .where({ id: networkId })
    .update({ deleted_at: receiveBlock.createdAt });
};
