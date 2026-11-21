import type { ActionContext, ActionHandler } from '../types.js';
import { LIQUIDITY_GOVERNANCE, revokeAdministrator } from '../bridge/governance.js';
import { updateLiquiditySettings } from './settings.js';

/**
 * Emergency: the administrator gives up control. Liquidity staking halts and
 * has no administrator until the guardians elect one.
 */
export const emergency: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, receiveBlock } = ctx;

  await revokeAdministrator(tx, LIQUIDITY_GOVERNANCE, receiveBlock.createdAt);
  await updateLiquiditySettings(tx, 'Emergency', { is_halted: true }, receiveBlock.createdAt);
};
