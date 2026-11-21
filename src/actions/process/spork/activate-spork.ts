import type { ActionContext, ActionHandler } from '../types.js';

/** Momentums between a spork's activation and its enforcement (SporkMinHeightDelay). */
export const SPORK_MIN_HEIGHT_DELAY = 6n;

export const activateSpork: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, receiveBlock, frontierMomentum } = ctx;
  const hash = String(decoded.id).replace(/^0x/i, '').toLowerCase();

  const spork = await tx('nom_sporks').where({ hash }).select('id').first();
  if (!spork) {
    throw new Error(`Spork.ActivateSpork: spork not found for ${hash}`);
  }

  await tx('nom_sporks')
    .where({ id: spork.id })
    .update({
      is_active: true,
      enforcement_height: (frontierMomentum.height + SPORK_MIN_HEIGHT_DELAY).toString(),
      activated_at: receiveBlock.createdAt,
    });
};
