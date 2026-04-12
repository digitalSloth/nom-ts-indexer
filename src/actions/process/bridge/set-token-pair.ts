import type { ActionContext, ActionHandler } from '../types.js';
import {
  ZNN_TOKEN_STANDARD,
  QSR_TOKEN_STANDARD,
  BRIDGE_SOFT_DELAY,
} from '../../../constants/zenon.js';
import { assertBridgeAdmin, findActiveBridgeNetwork } from './admin.js';
import { assertNoActiveChallenge } from './time-challenge.js';

function buildChallengeData(decoded: Record<string, any>): string {
  return JSON.stringify({
    networkClass: decoded.networkClass,
    chainId: decoded.chainId,
    tokenStandard: decoded.tokenStandard,
    tokenAddress: (decoded.tokenAddress as string)?.toLowerCase(),
    bridgeable: decoded.bridgeable,
    redeemable: decoded.redeemable,
    owned: decoded.owned,
    minAmount: decoded.minAmount?.toString(),
    feePercentage: decoded.feePercentage,
    redeemDelay: decoded.redeemDelay,
    metadata: decoded.metadata,
  });
}

export const setTokenPair: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (
    !decoded.networkClass ||
    !decoded.chainId ||
    !decoded.tokenStandard ||
    !decoded.tokenAddress
  ) {
    throw new Error('Bridge.SetTokenPair: missing required fields');
  }

  if (!(await assertBridgeAdmin(tx, sendBlock.accountId, 'SetTokenPair'))) return;

  if (
    !(await assertNoActiveChallenge(
      tx,
      receiveBlock,
      'SetTokenPair',
      buildChallengeData(decoded),
      BRIDGE_SOFT_DELAY,
    ))
  ) {
    console.warn('Bridge.SetTokenPair: time challenge still active');
    return;
  }

  const network = await findActiveBridgeNetwork(tx, decoded.networkClass, decoded.chainId);
  if (!network) {
    console.warn('Bridge.SetTokenPair: network not found');
    return;
  }

  const token = await tx('nom_tokens')
    .where({ token_standard: decoded.tokenStandard as string })
    .select('id')
    .first();
  if (!token) {
    console.warn('Bridge.SetTokenPair: token not found');
    return;
  }

  // ZNN/QSR cannot be owned
  if (
    decoded.owned &&
    (decoded.tokenStandard === ZNN_TOKEN_STANDARD || decoded.tokenStandard === QSR_TOKEN_STANDARD)
  ) {
    console.warn('Bridge.SetTokenPair: ZNN/QSR cannot be owned');
    return;
  }

  if (decoded.redeemDelay === 0) {
    console.warn('Bridge.SetTokenPair: redeemDelay cannot be 0');
    return;
  }

  // Upsert the token pair
  const existing = await tx('nom_bridge_network_tokens')
    .where({
      bridge_network_id: network.id,
      token_id: token.id,
    })
    .select('id')
    .first();

  const data = {
    token_address: decoded.tokenAddress as string,
    min_amount: decoded.minAmount?.toString() ?? '0',
    fee_percentage: Number(decoded.feePercentage ?? 0),
    redeem_delay: Number(decoded.redeemDelay ?? 0),
    metadata: decoded.metadata ? JSON.stringify(decoded.metadata) : null,
    is_bridgeable: Boolean(decoded.bridgeable),
    is_redeemable: Boolean(decoded.redeemable),
    is_owned: Boolean(decoded.owned),
    updated_at: receiveBlock.createdAt,
  };

  if (existing) {
    await tx('nom_bridge_network_tokens').where({ id: existing.id }).update(data);
  } else {
    await tx('nom_bridge_network_tokens').insert({
      bridge_network_id: network.id,
      token_id: token.id,
      ...data,
      created_at: receiveBlock.createdAt,
    });
  }
};
