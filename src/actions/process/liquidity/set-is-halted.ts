import type { ActionContext, ActionHandler } from '../types.js';
import { updateLiquiditySettings } from './settings.js';

/** SetIsHalted: halts or resumes liquidity staking. */
export const setIsHalted: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  await updateLiquiditySettings(
    tx,
    'SetIsHalted',
    { is_halted: Boolean(decoded.isHalted) },
    receiveBlock.createdAt,
  );
};
