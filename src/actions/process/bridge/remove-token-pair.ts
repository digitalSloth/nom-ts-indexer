import type { ActionContext, ActionHandler } from '../types.js';
import { assertBridgeAdmin, findActiveBridgeNetwork } from './admin.js';

export const removeTokenPair: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock } = ctx;

  if (
    !decoded.networkClass ||
    !decoded.chainId ||
    !decoded.tokenStandard ||
    !decoded.tokenAddress
  ) {
    throw new Error('Bridge.RemoveTokenPair: missing required fields');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'RemoveTokenPair'))) return;

  const network = await findActiveBridgeNetwork(tx, decoded.networkClass, decoded.chainId);
  if (!network) {
    console.warn('Bridge.RemoveTokenPair: network not found');
    return;
  }

  const token = await tx('nom_tokens')
    .where({ token_standard: decoded.tokenStandard as string })
    .select('id')
    .first();
  if (!token) {
    console.warn('Bridge.RemoveTokenPair: token not found');
    return;
  }

  await tx('nom_bridge_network_tokens')
    .where({
      bridge_network_id: network.id,
      token_id: token.id,
    })
    .del();
};
