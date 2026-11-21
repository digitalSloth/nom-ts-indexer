import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { createScratchDatabase, dropScratchDatabase } from './scratch.js';
import { syncContractMethods } from '../../src/database/contract-methods.js';
import { EMBEDDED_CONTRACTS } from '../../src/constants/zenon.js';

const SCRATCH = 'contract_methods_test';
const STAKE = EMBEDDED_CONTRACTS.find((c) => c.name === 'Stake Contract')!;
const ABI_METHODS = EMBEDDED_CONTRACTS.reduce(
  (n, c) => n + c.contractClass.getFunctions().length,
  0,
);

let db: Knex;

beforeAll(async () => {
  db = await createScratchDatabase(SCRATCH);
});

afterAll(async () => {
  await dropScratchDatabase(db, SCRATCH);
});

beforeEach(async () => {
  await db.raw(
    'TRUNCATE nom_contract_methods, nom_contracts, nom_accounts RESTART IDENTITY CASCADE',
  );
});

async function methodNames(contractName: string): Promise<string[]> {
  const rows = await db('nom_contract_methods as m')
    .join('nom_contracts as c', 'm.contract_id', 'c.id')
    .where('c.name', contractName)
    .orderBy('m.name')
    .select('m.name');
  return rows.map((r) => r.name);
}

describe('syncContractMethods', () => {
  it('adds every contract and ABI method to an empty database', async () => {
    expect(await syncContractMethods(db)).toBe(ABI_METHODS);

    const contracts = await db('nom_contracts').count({ n: '*' }).first();
    expect(Number(contracts.n)).toBe(EMBEDDED_CONTRACTS.length);
    const account = await db('nom_accounts').where({ address: STAKE.address }).first();
    expect(account).toMatchObject({ name: 'Stake Contract', is_embedded_contract: true });
  });

  it('adds only the methods that are missing and keeps existing ids', async () => {
    await syncContractMethods(db);
    const cancel = await db('nom_contract_methods').where({ name: 'Cancel' }).first();
    const stake = await db('nom_contract_methods as m')
      .join('nom_contracts as c', 'm.contract_id', 'c.id')
      .where({ 'c.name': 'Stake Contract', 'm.name': 'Stake' })
      .select('m.id')
      .first();
    await db('nom_contract_methods').where({ id: stake.id }).delete();

    expect(await syncContractMethods(db)).toBe(1);

    expect(await methodNames('Stake Contract')).toContain('Stake');
    const cancelAfter = await db('nom_contract_methods').where({ name: 'Cancel' }).first();
    expect(cancelAfter.id).toBe(cancel.id);
  });

  it('adds nothing on a second run', async () => {
    await syncContractMethods(db);
    expect(await syncContractMethods(db)).toBe(0);
  });

  it('marks an account a block created before the contract was known', async () => {
    await db('nom_accounts').insert({ address: STAKE.address });

    await syncContractMethods(db);

    const accounts = await db('nom_accounts').where({ address: STAKE.address });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ name: 'Stake Contract', is_embedded_contract: true });
  });
});
