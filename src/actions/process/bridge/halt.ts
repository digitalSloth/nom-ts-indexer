import type { ActionContext, ActionHandler } from '../types.js';
import { activeAdministratorId, BRIDGE_GOVERNANCE } from './governance.js';
import { nextTssNonce, updateBridgeSettings } from './settings.js';

/**
 * Halt: stops the bridge. The administrator halts directly. Anyone else
 * halts with a TSS signature, which uses up the current TSS nonce.
 */
export const halt: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, sendBlock, receiveBlock } = ctx;

  const fields: Record<string, unknown> = { is_halted: true, halted_at: receiveBlock.createdAt };
  if (sendBlock.accountId !== (await activeAdministratorId(tx, BRIDGE_GOVERNANCE))) {
    fields.tss_nonce = nextTssNonce(tx);
  }

  await updateBridgeSettings(tx, 'Halt', fields, receiveBlock.createdAt);
};
