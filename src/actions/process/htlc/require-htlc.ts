import { bareHex } from './hex.js';

/** Row id of an open HTLC. The contract deletes an HTLC once it is unlocked or reclaimed. */
export async function requireHtlcId(tx: any, methodName: string, htlcId: unknown): Promise<number> {
  const hash = bareHex(htlcId);
  const row = await tx('nom_htlcs')
    .where({ hash })
    .whereNull('unlocked_at')
    .whereNull('reclaimed_at')
    .select('id')
    .first();
  if (!row) {
    throw new Error(`Htlc.${methodName}: open HTLC not found for ${hash}`);
  }
  return row.id;
}
