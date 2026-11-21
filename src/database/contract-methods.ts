import type { Knex } from 'knex';
import { EMBEDDED_CONTRACTS } from '../constants/zenon.js';

/**
 * Adds every embedded contract and ABI method that is missing from
 * `nom_contracts` and `nom_contract_methods`, and returns the number of
 * methods added. Existing rows are left as they are, so it is safe to run
 * on every start: a newer SDK's methods are added before the contract
 * registry reads them. A contract's account is created if no block has
 * referenced its address yet.
 */
export async function syncContractMethods(db: Knex): Promise<number> {
  let methodCount = 0;

  for (const entry of EMBEDDED_CONTRACTS) {
    let accountId: number | null = null;

    if (entry.address !== null) {
      const [account] = await db('nom_accounts')
        .insert({ address: entry.address, name: entry.name, is_embedded_contract: true })
        .onConflict('address')
        .merge(['name', 'is_embedded_contract'])
        .returning('id');
      accountId = account.id;
    }

    let contract = await db('nom_contracts')
      .where({ name: entry.name, account_id: accountId })
      .select('id')
      .first();

    if (!contract) {
      [contract] = await db('nom_contracts')
        .insert({ account_id: accountId, name: entry.name })
        .returning('id');
    }

    for (const fn of entry.contractClass.getFunctions()) {
      const existing = await db('nom_contract_methods')
        .where({ contract_id: contract.id, fingerprint: fn.fingerprint })
        .select('id')
        .first();

      if (!existing) {
        await db('nom_contract_methods').insert({
          contract_id: contract.id,
          name: fn.name,
          signature: fn.signature,
          fingerprint: fn.fingerprint,
        });
        methodCount++;
      }
    }
  }

  return methodCount;
}
