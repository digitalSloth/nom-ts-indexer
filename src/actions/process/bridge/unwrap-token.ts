import type { ActionContext, ActionHandler } from '../types.js';
import { ZNN_TOKEN_STANDARD, QSR_TOKEN_STANDARD } from '../../../constants/zenon.js';
import { findActiveBridgeNetwork } from './admin.js';

export const unwrapToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (
    !decoded.networkClass ||
    !decoded.chainId ||
    !decoded.transactionHash ||
    decoded.logIndex === undefined ||
    !decoded.toAddress ||
    !decoded.tokenAddress ||
    !decoded.amount
  ) {
    throw new Error('Bridge.UnwrapToken: missing required fields');
  }

  const network = await findActiveBridgeNetwork(tx, decoded.networkClass, decoded.chainId);
  if (!network) {
    console.warn('Bridge.UnwrapToken: bridge network not found');
    return;
  }

  const networkToken = await tx('nom_bridge_network_tokens')
    .where({
      bridge_network_id: network.id,
      token_address: decoded.tokenAddress as string,
      is_redeemable: true,
    })
    .select('id', 'token_id')
    .first();
  if (!networkToken) {
    console.warn('Bridge.UnwrapToken: token not redeemable');
    return;
  }

  // Reject duplicate unwrap requests (matching Go behavior)
  const existing = await tx('nom_bridge_unwraps')
    .where({
      transaction_hash: decoded.transactionHash as string,
      log_index: BigInt(decoded.logIndex),
    })
    .select('id')
    .first();
  if (existing) {
    console.warn('Bridge.UnwrapToken: duplicate unwrap request');
    return;
  }

  await tx('nom_bridge_unwraps').insert({
    bridge_network_id: network.id,
    to_account_id: sendBlock.accountId,
    token_id: networkToken.token_id,
    account_block_id: sendBlock.id,
    transaction_hash: decoded.transactionHash as string,
    log_index: BigInt(decoded.logIndex),
    signature: decoded.signature as string,
    amount: decoded.amount as string,
    created_at: receiveBlock.createdAt,
  });

  // Update network totals
  const token = await tx('nom_tokens')
    .where({ id: networkToken.token_id })
    .select('token_standard')
    .first();

  if (token) {
    const amount = BigInt(decoded.amount as string);
    const updates: any = { updated_at: receiveBlock.createdAt };
    if (token.token_standard === ZNN_TOKEN_STANDARD) {
      updates.total_znn_unwrapped = tx.raw('?? + ?', ['total_znn_unwrapped', amount.toString()]);
      updates.total_znn_held = tx.raw('?? - ?', ['total_znn_held', amount.toString()]);
    } else if (token.token_standard === QSR_TOKEN_STANDARD) {
      updates.total_qsr_unwrapped = tx.raw('?? + ?', ['total_qsr_unwrapped', amount.toString()]);
      updates.total_qsr_held = tx.raw('?? - ?', ['total_qsr_held', amount.toString()]);
    }
    await tx('nom_bridge_networks').where({ id: network.id }).update(updates);
  }
};
