import type { ActionContext, ActionHandler } from '../types.js';

/**
 * Sets whether any account may unlock the sender's HTLCs by presenting the
 * preimage. The contract allows it until the account denies it.
 */
function setProxyUnlock(allowed: boolean): ActionHandler {
  return async (ctx: ActionContext): Promise<void> => {
    const { tx, sendBlock } = ctx;
    await tx('nom_accounts')
      .where({ id: sendBlock.accountId })
      .update({ is_htlc_proxy_unlock_allowed: allowed });
  };
}

export const allowProxyUnlock = setProxyUnlock(true);
export const denyProxyUnlock = setProxyUnlock(false);
