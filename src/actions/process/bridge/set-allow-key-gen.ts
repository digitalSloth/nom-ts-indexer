import type { ActionContext, ActionHandler } from '../types.js';
import { updateBridgeSettings } from './settings.js';

/** SetAllowKeyGen: opens or closes TSS key generation. */
export const setAllowKeyGen: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock, frontierMomentum } = ctx;

  const allowKeyGen = Boolean(decoded.allowKeyGen);
  const fields: Record<string, unknown> = { allow_key_gen: allowKeyGen };
  // Opening key generation records the height it opened at.
  if (allowKeyGen) {
    fields.allow_key_gen_height = frontierMomentum.height;
  }

  await updateBridgeSettings(tx, 'SetAllowKeyGen', fields, receiveBlock.createdAt);
};
