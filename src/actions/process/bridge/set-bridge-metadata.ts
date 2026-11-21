import type { ActionContext, ActionHandler } from '../types.js';
import { updateBridgeSettings } from './settings.js';

/** SetBridgeMetadata: replaces the bridge's metadata string. */
export const setBridgeMetadata: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  await updateBridgeSettings(
    tx,
    'SetBridgeMetadata',
    { metadata: decoded.metadata as string },
    receiveBlock.createdAt,
  );
};
