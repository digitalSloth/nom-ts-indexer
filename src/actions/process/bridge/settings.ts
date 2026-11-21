/** The bridge contract's settings live in the single `nom_bridge_settings` row. */
export const BRIDGE_SETTINGS_ID = 1;

/**
 * Updates the bridge settings row. The bridge seeder creates it, so a
 * missing row means the database was not seeded.
 */
export async function updateBridgeSettings(
  tx: any,
  methodName: string,
  fields: Record<string, unknown>,
  at: Date,
): Promise<void> {
  const updated = await tx('nom_bridge_settings')
    .where({ id: BRIDGE_SETTINGS_ID })
    .update({ ...fields, updated_at: at });
  if (updated === 0) {
    throw new Error(`Bridge.${methodName}: settings not found for id ${BRIDGE_SETTINGS_ID}`);
  }
}

/** Increments the nonce the orchestrator signs TSS messages with. */
export function nextTssNonce(tx: any): unknown {
  return tx.raw('?? + 1', ['tss_nonce']);
}
