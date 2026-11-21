import type { ActionContext, ActionHandler } from '../types.js';
import { accountRegistry } from '../../../services/registries/account-registry.js';
import { bareHex } from '../htlc/hex.js';
import { requirePtlcId } from './require-ptlc.js';

async function payUnlock(
  ctx: ActionContext,
  methodName: string,
  unlockedToAccountId: number,
): Promise<void> {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;
  const id = await requirePtlcId(tx, methodName, decoded.id);

  await tx('nom_ptlcs')
    .where({ id })
    .update({
      signature: bareHex(decoded.signature),
      unlocked_to_account_id: unlockedToAccountId,
      unlock_account_block_id: sendBlock.id,
      unlocked_at: receiveBlock.createdAt,
    });
}

/** Pays the PTLC to the caller and reveals the witness. */
export const unlock: ActionHandler = (ctx: ActionContext) =>
  payUnlock(ctx, 'Unlock', ctx.sendBlock.accountId);

/** Pays the PTLC to the `destination` argument and reveals the witness. */
export const proxyUnlock: ActionHandler = async (ctx: ActionContext) =>
  payUnlock(
    ctx,
    'ProxyUnlock',
    await accountRegistry.getOrCreate(ctx.tx, String(ctx.decoded.destination)),
  );
