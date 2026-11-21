import type { ActionContext, ActionHandler } from '../types.js';
import { requireBridgeNetwork, requireBridgeToken } from './network.js';

export const removeTokenPair: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded } = ctx;

  const networkId = await requireBridgeNetwork(
    tx,
    'RemoveTokenPair',
    decoded.networkClass,
    decoded.chainId,
  );
  const tokenId = await requireBridgeToken(tx, 'RemoveTokenPair', decoded.tokenStandard);

  await tx('nom_bridge_network_tokens')
    .where({ bridge_network_id: networkId, token_id: tokenId })
    .del();
};
