import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { requireBridgeNetwork } from './network.js';

export const unwrapToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  const networkId = await requireBridgeNetwork(
    tx,
    'UnwrapToken',
    decoded.networkClass,
    decoded.chainId,
  );

  // The contract matches the token pair by its lower-case token address.
  const tokenAddress = (decoded.tokenAddress as string).toLowerCase();
  const networkToken = await tx('nom_bridge_network_tokens')
    .where({ bridge_network_id: networkId, token_address: tokenAddress })
    .select('token_id')
    .first();
  if (!networkToken) {
    throw new Error(`Bridge.UnwrapToken: token pair not found for ${tokenAddress}`);
  }

  // The unwrap pays out to toAddress, whoever submitted it.
  const toAccountId = await accountRegistry.getOrCreate(tx, decoded.toAddress as string);
  const amount = decoded.amount.toString();

  // The network totals count the unwrap when it is redeemed.
  await tx('nom_bridge_unwraps').insert({
    bridge_network_id: networkId,
    to_account_id: toAccountId,
    token_id: networkToken.token_id,
    account_block_id: sendBlock.id,
    transaction_hash: decoded.transactionHash as string,
    log_index: BigInt(decoded.logIndex),
    signature: decoded.signature as string,
    amount,
    created_at: receiveBlock.createdAt,
    updated_at: receiveBlock.createdAt,
  });
};
