import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { createScratchDatabase, dropScratchDatabase } from './scratch.js';
import { backfillAcceptedAt } from '../../src/database/scripts/backfill-accepted-at.js';

const SCRATCH = 'backfill_accepted_at_test';
const G = Date.parse('2024-01-01T00:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(G + days * DAY);

const YES = 0;
const NO = 1;

const ACCELERATOR = 1;
const PILLAR_CONTRACT = 2;
const OWNER_A = 3;
const OWNER_B = 4;
const OLD_PRODUCER_C = 6;
const PRODUCER_C = 7;
const USER = 8;

const P1 = 'a1'.repeat(32);
const P2 = 'b2'.repeat(32);
const P3 = 'c3'.repeat(32);

let db: Knex;
let blockId = 0;
let receiveHeight = 0;

/** A send to the contract and its receive, acknowledging the momentum of `day`. */
async function call(
  sender: number,
  methodId: number,
  day: number,
  decoded: Record<string, unknown>,
  callStatus = 1,
  contractAccount = ACCELERATOR,
) {
  const send = ++blockId;
  const receive = ++blockId;
  const block = (id: number, account: number, to: number) => ({
    id,
    account_id: account,
    to_account_id: to,
    momentum_id: day,
    block_type: account === contractAccount ? 5 : 2,
    height: id,
    hash: `block-${id}`,
    created_at: at(day),
  });
  await db('nom_account_blocks').insert({
    ...block(send, sender, contractAccount),
    contract_method_id: methodId,
  });
  await db('nom_account_block_data').insert({
    account_block_id: send,
    raw: '',
    decoded: JSON.stringify(decoded),
  });
  await db('nom_account_blocks').insert({
    ...block(receive, contractAccount, sender),
    height: ++receiveHeight,
    paired_account_block_id: send,
    momentum_acknowledged_id: day,
    call_status: callStatus,
  });
}

const voteByName = (
  sender: number,
  day: number,
  name: string,
  item: string,
  vote: number,
  status = 1,
) => call(sender, 1, day, { id: `0x${item}`, name, vote }, status);
const voteByProducer = (sender: number, day: number, item: string, vote: number) =>
  call(sender, 2, day, { id: `0x${item}`, vote });
const update = (day: number) => call(USER, 3, day, {});

async function insertFixtures() {
  await db('nom_accounts').insert([
    { id: ACCELERATOR, address: 'z1accelerator', is_embedded_contract: true },
    { id: PILLAR_CONTRACT, address: 'z1pillar', is_embedded_contract: true },
    { id: OWNER_A, address: 'z1owner-a' },
    { id: OWNER_B, address: 'z1owner-b' },
    { id: 5, address: 'z1owner-c' },
    { id: OLD_PRODUCER_C, address: 'z1producer-c-old' },
    { id: PRODUCER_C, address: 'z1producer-c' },
    { id: USER, address: 'z1user' },
  ]);
  await db('nom_contracts').insert([
    { id: 1, account_id: ACCELERATOR, name: 'Accelerator Contract' },
    { id: 2, account_id: PILLAR_CONTRACT, name: 'Pillar Contract' },
  ]);
  await db('nom_contract_methods').insert([
    { id: 1, contract_id: 1, name: 'VoteByName', signature: 'x', fingerprint: 'x' },
    { id: 2, contract_id: 1, name: 'VoteByProdAddress', signature: 'x', fingerprint: 'x' },
    { id: 3, contract_id: 1, name: 'Update', signature: 'x', fingerprint: 'x' },
    { id: 4, contract_id: 2, name: 'VoteByName', signature: 'x', fingerprint: 'x' },
  ]);
  await db('nom_momentums').insert(
    Array.from({ length: 10 }, (_, day) => ({
      id: day + 1,
      height: day + 1,
      hash: `m${day + 1}`,
      created_at: at(day + 1),
      producer_account_id: ACCELERATOR,
    })),
  );
  const pillar = (id: number, owner: number, producer: number, name: string) => ({
    id,
    owner_id: owner,
    producer_account_id: producer,
    withdraw_account_id: owner,
    name,
    slug: name,
    created_at: at(-30),
  });
  // Three pillars: one vote with more yes than no passes.
  await db('nom_pillars').insert([
    pillar(1, OWNER_A, OWNER_A, 'A'),
    pillar(2, OWNER_B, OWNER_B, 'B'),
    pillar(3, 5, PRODUCER_C, 'C'),
  ]);
  // C's producer was the old account before it moved to the current one.
  await db('nom_pillar_update_histories').insert([
    {
      pillar_id: 3,
      producer_account_id: OLD_PRODUCER_C,
      withdraw_account_id: 5,
      updated_at: at(-20),
    },
    { pillar_id: 3, producer_account_id: PRODUCER_C, withdraw_account_id: 5, updated_at: at(8) },
  ]);
  const project = (id: number, hash: string, status: number, acceptedAt: Date | null) => ({
    id,
    owner_id: USER,
    hash,
    name: `Project ${id}`,
    slug: `project-${id}`,
    url: 'https://example.org',
    description: 'x',
    status,
    accepted_at: acceptedAt,
    created_at: at(0),
  });
  await db('nom_accelerator_projects').insert([
    project(1, P1, 1, null),
    project(2, P2, 3, null),
    project(3, P3, 4, at(5)),
  ]);

  // momentum ids equal their day: momentum 2 is at(2).
  await voteByName(OWNER_A, 1, 'A', P1, NO);
  await voteByName(OWNER_A, 1, 'A', P1, YES, 2); // failed call
  await call(OWNER_B, 4, 1, { id: `0x${P2}`, name: 'B', vote: YES }, 1, PILLAR_CONTRACT);
  await update(2);
  await voteByProducer(OLD_PRODUCER_C, 3, P1, YES);
  await voteByName(OWNER_B, 3, 'B', P1, YES);
  await update(4);
  await update(5);
}

const acceptedAt = async (id: number) =>
  (await db('nom_accelerator_projects').where({ id }).first()).accepted_at;

describe('backfillAcceptedAt', () => {
  beforeAll(async () => {
    db = await createScratchDatabase(SCRATCH);
    await insertFixtures();
  });

  afterAll(async () => {
    await dropScratchDatabase(db, SCRATCH);
  });

  it('reports the first update that passed each project without writing on a dry run', async () => {
    const report = await backfillAcceptedAt(db, { write: false });

    expect(report.filled).toEqual([{ id: 1, hash: P1, name: 'Project 1', acceptedAt: at(4) }]);
    expect(report.mismatches).toEqual([]);
    expect(report.written).toBe(false);
    expect(await acceptedAt(1)).toBeNull();
  });

  it('writes nothing while the replay disagrees with a project status', async () => {
    await db('nom_accelerator_projects').where({ id: 2 }).update({ status: 1 });
    try {
      const report = await backfillAcceptedAt(db, { write: true });

      expect(report.mismatches).toEqual([{ id: 2, hash: P2, name: 'Project 2', status: 1 }]);
      expect(report.written).toBe(false);
      expect(await acceptedAt(1)).toBeNull();
    } finally {
      await db('nom_accelerator_projects').where({ id: 2 }).update({ status: 3 });
    }
  });

  it('fills empty acceptance times and keeps recorded ones', async () => {
    const report = await backfillAcceptedAt(db, { write: true });

    expect(report.written).toBe(true);
    expect(await acceptedAt(1)).toEqual(at(4));
    expect(await acceptedAt(2)).toBeNull();
    expect(await acceptedAt(3)).toEqual(at(5));
  });
});
