import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { bareHex } from './hex.js';
import { expiryDate } from '../expiry.js';

export const create: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;

  await tx('nom_htlcs').insert({
    // The contract uses the Create send block hash as the HTLC id.
    hash: sendBlock.hash,
    account_block_id: sendBlock.id,
    time_locked_account_id: sendBlock.accountId,
    hash_locked_account_id: await accountRegistry.getOrCreate(tx, String(decoded.hashLocked)),
    token_id: sendBlock.tokenId,
    amount: sendBlock.amount,
    hash_type: Number(decoded.hashType),
    key_max_size: Number(decoded.keyMaxSize),
    hash_lock: bareHex(decoded.hashLock),
    expires_at: expiryDate(decoded.expirationTime),
    created_at: receiveBlock.createdAt,
  });
};
