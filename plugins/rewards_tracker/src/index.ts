import type {
  ZenonIndexerPlugin,
  PluginContext,
  IndexedAccountBlockEvent,
  IndexedMomentumEvent,
} from '../../../src/plugins/types.js';
import { handleReward } from './reward-handler.js';

const MINT_CONTRACT = 'Token Contract';
const MINT_METHOD = 'Mint';

function createPlugin(): ZenonIndexerPlugin {
  let ctx: PluginContext;

  return {
    name: 'rewards_tracker',

    async init(pluginCtx: PluginContext): Promise<void> {
      ctx = pluginCtx;
    },

    async onAccountBlock(event: IndexedAccountBlockEvent): Promise<void> {
      const cm = event.contractMethod;
      if (!cm) return;
      if (cm.contractName !== MINT_CONTRACT || cm.methodName !== MINT_METHOD) return;

      await handleReward(event, ctx.db);
    },

    async onMomentum(_momentum: IndexedMomentumEvent): Promise<void> {},

    async shutdown(): Promise<void> {},
  };
}

export default createPlugin;
