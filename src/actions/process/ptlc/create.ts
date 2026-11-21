import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { BURN_ADDRESS } from '../../../constants/zenon.js';
import { bareHex } from '../htlc/hex.js';
import { expiryDate } from '../expiry.js';

async function insertPtlc(ctx: ActionContext, reclaim: Record<string, unknown>): Promise<void> {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;
  const destination = String(decoded.destination);

  await tx('nom_ptlcs').insert({
    // The contract uses the Create send block hash as the PTLC id.
    hash: sendBlock.hash,
    account_block_id: sendBlock.id,
    time_locked_account_id: sendBlock.accountId,
    // The zero address means any holder of the witness may unlock.
    destination_account_id:
      destination === BURN_ADDRESS ? null : await accountRegistry.getOrCreate(tx, destination),
    token_id: sendBlock.tokenId,
    amount: sendBlock.amount,
    point_type: Number(decoded.pointType),
    point_lock: bareHex(decoded.pointLock),
    ...reclaim,
    expires_at: expiryDate(decoded.expirationTime),
    created_at: receiveBlock.createdAt,
  });
}

export const create: ActionHandler = (ctx: ActionContext) => insertPtlc(ctx, {});

export const createWithReclaimLock: ActionHandler = (ctx: ActionContext) =>
  insertPtlc(ctx, {
    reclaim_point_type: Number(ctx.decoded.reclaimPointType),
    reclaim_point_lock: bareHex(ctx.decoded.reclaimPointLock),
  });
