import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_SOFT_DELAY } from '../../../constants/zenon.js';
import { requireBridgeNetwork, requireBridgeToken } from './network.js';
import { passTimeChallenge } from './time-challenge.js';
import { BRIDGE_GOVERNANCE } from './governance.js';

export const setTokenPair: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  // The contract stores and matches token addresses in lower case.
  const tokenAddress = (decoded.tokenAddress as string).toLowerCase();
  const minAmount = decoded.minAmount.toString();
  const challengeData = JSON.stringify({
    networkClass: decoded.networkClass,
    chainId: decoded.chainId,
    tokenStandard: decoded.tokenStandard,
    tokenAddress,
    bridgeable: decoded.bridgeable,
    redeemable: decoded.redeemable,
    owned: decoded.owned,
    minAmount,
    feePercentage: decoded.feePercentage,
    redeemDelay: decoded.redeemDelay,
    metadata: decoded.metadata,
  });
  if (
    !(await passTimeChallenge(
      ctx,
      BRIDGE_GOVERNANCE,
      'SetTokenPair',
      challengeData,
      BRIDGE_SOFT_DELAY,
    ))
  ) {
    return;
  }

  const networkId = await requireBridgeNetwork(
    tx,
    'SetTokenPair',
    decoded.networkClass,
    decoded.chainId,
  );
  const tokenId = await requireBridgeToken(tx, 'SetTokenPair', decoded.tokenStandard);

  const fields = {
    token_id: tokenId,
    token_address: tokenAddress,
    min_amount: minAmount,
    fee_percentage: Number(decoded.feePercentage),
    redeem_delay: Number(decoded.redeemDelay),
    metadata: decoded.metadata as string,
    is_bridgeable: Boolean(decoded.bridgeable),
    is_redeemable: Boolean(decoded.redeemable),
    is_owned: Boolean(decoded.owned),
    updated_at: receiveBlock.createdAt,
  };

  // The contract replaces the pair with the same token or the same address.
  const existing = await tx('nom_bridge_network_tokens')
    .where({ bridge_network_id: networkId })
    .where((q: any) => q.where({ token_id: tokenId }).orWhere({ token_address: tokenAddress }))
    .select('id')
    .first();

  if (existing) {
    await tx('nom_bridge_network_tokens').where({ id: existing.id }).update(fields);
  } else {
    await tx('nom_bridge_network_tokens').insert({
      bridge_network_id: networkId,
      ...fields,
      created_at: receiveBlock.createdAt,
    });
  }
};
