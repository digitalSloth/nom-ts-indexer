import type { ActionContext, ActionHandler } from '../types.js';
import { BRIDGE_SOFT_DELAY } from '../../../constants/zenon.js';
import { passTimeChallenge } from '../bridge/time-challenge.js';
import { LIQUIDITY_GOVERNANCE } from '../bridge/governance.js';
import { updateLiquiditySettings } from './settings.js';

/**
 * SetAdditionalReward: sets the extra ZNN and QSR paid to liquidity stakers
 * each epoch once the time challenge passes.
 */
export const setAdditionalReward: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  const znnReward = decoded.znnReward.toString();
  const qsrReward = decoded.qsrReward.toString();
  if (
    !(await passTimeChallenge(
      ctx,
      LIQUIDITY_GOVERNANCE,
      'SetAdditionalReward',
      `${znnReward},${qsrReward}`,
      BRIDGE_SOFT_DELAY,
    ))
  ) {
    return;
  }

  await updateLiquiditySettings(
    tx,
    'SetAdditionalReward',
    { znn_reward: znnReward, qsr_reward: qsrReward },
    receiveBlock.createdAt,
  );
};
