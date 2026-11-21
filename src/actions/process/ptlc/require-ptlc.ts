import { bareHex } from '../htlc/hex.js';

/** Row id of an open PTLC. The contract deletes a PTLC once it is unlocked or reclaimed. */
export async function requirePtlcId(tx: any, methodName: string, ptlcId: unknown): Promise<number> {
  const hash = bareHex(ptlcId);
  const row = await tx('nom_ptlcs')
    .where({ hash })
    .whereNull('unlocked_at')
    .whereNull('reclaimed_at')
    .select('id')
    .first();
  if (!row) {
    throw new Error(`Ptlc.${methodName}: open PTLC not found for ${hash}`);
  }
  return row.id;
}
