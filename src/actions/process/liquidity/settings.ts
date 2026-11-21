/** The liquidity contract's settings live in the single `nom_liquidity_settings` row. */
export const LIQUIDITY_SETTINGS_ID = 1;

/**
 * Updates the liquidity settings row. The liquidity seeder creates it, so a
 * missing row means the database was not seeded.
 */
export async function updateLiquiditySettings(
  tx: any,
  methodName: string,
  fields: Record<string, unknown>,
  at: Date,
): Promise<void> {
  const updated = await tx('nom_liquidity_settings')
    .where({ id: LIQUIDITY_SETTINGS_ID })
    .update({ ...fields, updated_at: at });
  if (updated === 0) {
    throw new Error(`Liquidity.${methodName}: settings not found for id ${LIQUIDITY_SETTINGS_ID}`);
  }
}
