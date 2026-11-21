import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_GOVERNANCE, revokeAdministrator } from './governance.js';
import { updateBridgeSettings } from './settings.js';

/**
 * Emergency: the administrator gives up control. The bridge halts, loses its
 * TSS key and has no administrator until the guardians elect one.
 */
export const emergency: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, receiveBlock } = ctx;

  await revokeAdministrator(tx, BRIDGE_GOVERNANCE, receiveBlock.createdAt);
  await updateBridgeSettings(
    tx,
    'Emergency',
    {
      compressed_tss_ecdsa_pub_key: null,
      decompressed_tss_ecdsa_pub_key: null,
      is_halted: true,
      halted_at: receiveBlock.createdAt,
    },
    receiveBlock.createdAt,
  );
};
