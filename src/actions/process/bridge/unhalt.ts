import type { ActionContext, ActionHandler } from '../types.js';
import { updateBridgeSettings } from './settings.js';

/**
 * Unhalt: clears the halt flag. The bridge stays halted until
 * unhalted_at_height + unhalt_duration has passed.
 */
export const unhalt: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, receiveBlock, frontierMomentum } = ctx;

  await updateBridgeSettings(
    tx,
    'Unhalt',
    {
      is_halted: false,
      unhalted_at_height: frontierMomentum.height,
      unhalted_at: receiveBlock.createdAt,
    },
    receiveBlock.createdAt,
  );
};
