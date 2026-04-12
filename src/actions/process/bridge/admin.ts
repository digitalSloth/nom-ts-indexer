/**
 * Returns the accountId of the active bridge administrator,
 * or null if no admin is currently accepted and not revoked.
 */
export async function getActiveAdminAccountId(tx: any): Promise<number | null> {
  const admin = await tx('nom_bridge_admins')
    .whereNotNull('accepted_at')
    .whereNull('revoked_at')
    .select('account_id')
    .first();
  return admin?.account_id ?? null;
}

/**
 * Verifies the sender is the active bridge admin.
 * Returns true if authorized, false if not (warns and returns).
 */
export async function assertBridgeAdmin(
  tx: any,
  senderAccountId: number,
  actionName: string,
): Promise<boolean> {
  const adminAccountId = await getActiveAdminAccountId(tx);
  if (adminAccountId !== senderAccountId) {
    console.warn(`Bridge.${actionName}: sender is not bridge admin`);
    return false;
  }
  return true;
}

/**
 * Finds an active (non-deleted) bridge network by class and chain ID.
 * Returns the network or null.
 */
export async function findActiveBridgeNetwork(
  tx: any,
  networkClass: number | bigint,
  chainId: number | bigint,
): Promise<{ id: number } | null> {
  return tx('nom_bridge_networks')
    .where({
      network_class: BigInt(networkClass),
      chain_identifier: BigInt(chainId),
    })
    .whereNull('deleted_at')
    .select('id')
    .first();
}
