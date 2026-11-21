import type { ActionContext, ActionHandler } from '../types.js';
import { updateBridgeSettings } from './settings.js';

/** SetOrchestratorInfo: replaces the orchestrator settings. */
export const setOrchestratorInfo: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock } = ctx;

  await updateBridgeSettings(
    tx,
    'SetOrchestratorInfo',
    {
      window_size: BigInt(decoded.windowSize.toString()),
      key_gen_threshold: BigInt(decoded.keyGenThreshold.toString()),
      confirmations_to_finality: BigInt(decoded.confirmationsToFinality.toString()),
      estimated_momentum_time: BigInt(decoded.estimatedMomentumTime.toString()),
    },
    receiveBlock.createdAt,
  );
};
