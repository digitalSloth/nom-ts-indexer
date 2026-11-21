import type { ActionContext, ActionHandler } from '../types.js';
import { requireBridgeNetwork, updateNetworkTotals } from './network.js';

/** Fee percentages are in basis points of this total. */
const BRIDGE_MAXIMUM_FEE = 10000n;

export const wrapToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock, frontierMomentum } = ctx;

  const networkId = await requireBridgeNetwork(
    tx,
    'WrapToken',
    decoded.networkClass,
    decoded.chainId,
  );

  const pair = await tx('nom_bridge_network_tokens')
    .where({ bridge_network_id: networkId, token_id: sendBlock.tokenId })
    .select('fee_percentage')
    .first();
  if (!pair) {
    throw new Error(`Bridge.WrapToken: token pair not found for token ${sendBlock.tokenId}`);
  }
  // The contract keeps amount * fee_percentage / 10000, rounded down.
  const fee = (BigInt(sendBlock.amount) * BigInt(pair.fee_percentage)) / BRIDGE_MAXIMUM_FEE;

  await tx('nom_bridge_wraps').insert({
    bridge_network_id: networkId,
    account_id: sendBlock.accountId,
    token_id: sendBlock.tokenId!,
    account_block_id: sendBlock.id,
    // The contract stores the destination address in lower case.
    to_address: (decoded.toAddress as string).toLowerCase(),
    amount: sendBlock.amount,
    fee: fee.toString(),
    creation_momentum_height: frontierMomentum.height,
    created_at: receiveBlock.createdAt,
  });

  await updateNetworkTotals(
    tx,
    networkId,
    sendBlock.tokenId!,
    'wrapped',
    sendBlock.amount,
    receiveBlock.createdAt,
  );
};
