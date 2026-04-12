import type {
  ZenonIndexerPlugin,
  PluginContext,
  IndexedAccountBlockEvent,
  IndexedMomentumEvent,
} from '../../../src/plugins/types.js';
import { handleBlock } from './balance-handler.js';
import { seedGenesisBalances } from './genesis.js';

function createPlugin(): ZenonIndexerPlugin {
  let ctx: PluginContext;

  return {
    name: 'bl_tracker',

    async init(pluginCtx: PluginContext): Promise<void> {
      ctx = pluginCtx;

      const existing = await ctx.db.query<{ id: number }>(
        `SELECT id FROM bl_tracker_balances LIMIT 1`
      );
      if (existing.length === 0) {
        await seedGenesisBalances(ctx);
      }
    },

    async onAccountBlock(event: IndexedAccountBlockEvent): Promise<void> {
      await handleBlock(event, ctx.db);
    },

    async onMomentum(_momentum: IndexedMomentumEvent): Promise<void> {},

    async shutdown(): Promise<void> {},
  };
}

export default createPlugin;
