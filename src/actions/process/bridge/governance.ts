/**
 * The bridge and liquidity contracts share the same governance methods:
 * an administrator, a guardian set that elects a new administrator in an
 * emergency, and time challenges on sensitive changes. Each contract keeps
 * its own state, stored in its own tables.
 */
export interface GovernedContract {
  /** Contract name in `nom_contracts`. */
  contractName: string;
  /** Prefix for error messages. */
  label: string;
  adminsTable: string;
  guardiansTable: string;
}

export const BRIDGE_GOVERNANCE: GovernedContract = {
  contractName: 'Bridge Contract',
  label: 'Bridge',
  adminsTable: 'nom_bridge_admins',
  guardiansTable: 'nom_bridge_guardians',
};

export const LIQUIDITY_GOVERNANCE: GovernedContract = {
  contractName: 'Liquidity Contract',
  label: 'Liquidity',
  adminsTable: 'nom_liquidity_admins',
  guardiansTable: 'nom_liquidity_guardians',
};

/**
 * The account id of the contract's current administrator, or null while an
 * emergency has left the contract without one.
 */
export async function activeAdministratorId(
  tx: any,
  contract: GovernedContract,
): Promise<number | null> {
  const admin = await tx(contract.adminsTable)
    .whereNotNull('accepted_at')
    .whereNull('revoked_at')
    .select('account_id')
    .first();
  return admin?.account_id ?? null;
}

/** Ends the term of the contract's current administrator. */
export async function revokeAdministrator(
  tx: any,
  contract: GovernedContract,
  at: Date,
): Promise<void> {
  await tx(contract.adminsTable)
    .whereNotNull('accepted_at')
    .whereNull('revoked_at')
    .update({ revoked_at: at });
}
