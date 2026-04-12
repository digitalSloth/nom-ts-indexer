import type { ActionContext, ActionHandler } from '../types.js';

export const donate: ActionHandler = async (_ctx: ActionContext): Promise<void> => {
  // Donate is a no-op for the indexer — the transfer is recorded as an account block.
};
