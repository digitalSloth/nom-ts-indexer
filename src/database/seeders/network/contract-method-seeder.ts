import { db } from '../../knex.js';
import { EMBEDDED_CONTRACTS } from '../../../constants/zenon.js';

/**
 * Seed contract methods from each embedded contract's SDK ABI.
 */
export async function seedContractMethods(): Promise<void> {
  console.log('Seeding contract methods...');

  let methodCount = 0;

  for (const entry of EMBEDDED_CONTRACTS) {
    let accountId: number | null = null;

    if (entry.address !== null) {
      const account = await db('nom_accounts')
        .where({ address: entry.address })
        .select('id')
        .first();

      if (!account) {
        console.warn(`  ⚠ Account not found for contract: ${entry.name}`);
        continue;
      }

      accountId = account.id;
    }

    let contract = await db('nom_contracts')
      .where({ name: entry.name, account_id: accountId })
      .select('id')
      .first();

    if (!contract) {
      const [result] = await db('nom_contracts')
        .insert({ account_id: accountId, name: entry.name })
        .returning('id');
      contract = result;
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

  console.log(`  ✓ ${methodCount} contract methods seeded`);
  console.log('✓ Contract methods seeded successfully\n');
}
