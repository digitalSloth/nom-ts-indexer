import type { ActionContext, ActionHandler } from '../types.js';
import { ZNN_TOKEN_STANDARD, QSR_TOKEN_STANDARD } from '../../../constants/zenon.js';
import { findActiveBridgeNetwork } from './admin.js';

export const wrapToken: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  if (!decoded.networkClass || !decoded.chainId || !decoded.toAddress) {
    throw new Error('Bridge.WrapToken: missing required fields');
  }

  const network = await findActiveBridgeNetwork(tx, decoded.networkClass, decoded.chainId);
  if (!network) {
    console.warn('Bridge.WrapToken: bridge network not found');
    return;
  }

  const networkToken = await tx('nom_bridge_network_tokens')
    .where({
      bridge_network_id: network.id,
      token_id: sendBlock.tokenId!,
      is_bridgeable: true,
    })
    .select('id', 'min_amount')
    .first();
  if (!networkToken) {
    console.warn('Bridge.WrapToken: token not bridgeable');
    return;
  }

  if (BigInt(sendBlock.amount) < BigInt(networkToken.min_amount)) {
    console.warn('Bridge.WrapToken: amount below minimum');
    return;
  }

  const existing = await tx('nom_bridge_wraps')
    .where({ account_block_id: sendBlock.id })
    .select('id')
    .first();
  if (existing) return;

  await tx('nom_bridge_wraps').insert({
    bridge_network_id: network.id,
    account_id: sendBlock.accountId,
    token_id: sendBlock.tokenId!,
    account_block_id: sendBlock.id,
    to_address: decoded.toAddress as string,
    amount: sendBlock.amount,
    created_at: receiveBlock.createdAt,
  });

  // Update network totals
  const token = await tx('nom_tokens')
    .where({ id: sendBlock.tokenId! })
    .select('token_standard')
    .first();

  if (token) {
    const amount = BigInt(sendBlock.amount);
    const updates: any = { updated_at: receiveBlock.createdAt };
    if (token.token_standard === ZNN_TOKEN_STANDARD) {
      updates.total_znn_wrapped = tx.raw('?? + ?', ['total_znn_wrapped', amount.toString()]);
      updates.total_znn_held = tx.raw('?? + ?', ['total_znn_held', amount.toString()]);
    } else if (token.token_standard === QSR_TOKEN_STANDARD) {
      updates.total_qsr_wrapped = tx.raw('?? + ?', ['total_qsr_wrapped', amount.toString()]);
      updates.total_qsr_held = tx.raw('?? + ?', ['total_qsr_held', amount.toString()]);
    }
    await tx('nom_bridge_networks').where({ id: network.id }).update(updates);
  }
};
