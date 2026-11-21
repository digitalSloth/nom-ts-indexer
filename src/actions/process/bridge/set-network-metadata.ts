import type { ActionContext, ActionHandler } from '../types.js';
import { requireBridgeNetwork } from './network.js';

export const setNetworkMetadata: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const networkId = await requireBridgeNetwork(
    tx,
    'SetNetworkMetadata',
    decoded.networkClass,
    decoded.chainId,
  );

  await tx('nom_bridge_networks')
    .where({ id: networkId })
    .update({ meta_data: decoded.metadata as string, updated_at: receiveBlock.createdAt });
};
