import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { createScratchDatabase, dropScratchDatabase } from './scratch.js';
import {
  markPillarRanksDirty,
  recordPillarProduction,
  refreshPillarEngagement,
  refreshPillarRanks,
} from '../../src/actions/indexer/pillar-metrics.js';
import { updateAccountTokenBalance } from '../../src/actions/indexer/update-account-token-balance.js';
import { delegate } from '../../src/actions/process/pillar/delegate.js';
import { undelegate } from '../../src/actions/process/pillar/undelegate.js';
import { revoke } from '../../src/actions/process/pillar/revoke.js';
import { tokenRegistry } from '../../src/services/registries/token-registry.js';
import { genesisTimestamp, readGenesis } from '../../src/database/seeders/genesis/genesis-file.js';
import { ZNN_TOKEN_STANDARD } from '../../src/constants/zenon.js';
import type { ActionContext } from '../../src/actions/process/types.js';

const SCRATCH = 'pillar_metrics_test';
const DAY = 86_400_000;
const ZNN = 1;
const QSR = 2;
const OWNER = 1;
const ALICE = 2;
const BOB = 3;
const CAROL = 4;

let db: Knex;
let genesis: number;
const at = (ms: number) => new Date(genesis + ms);

beforeAll(async () => {
  db = await createScratchDatabase(SCRATCH);
  genesis = genesisTimestamp(await readGenesis<{ GenesisTimestampSec: number }>()).getTime();
});

afterAll(async () => {
  await dropScratchDatabase(db, SCRATCH);
});

beforeEach(async () => {
  await db.raw(
    `TRUNCATE nom_votes, nom_accelerator_phases, nom_accelerator_projects, nom_delegations,
      nom_account_tokens, nom_momentums, nom_pillars, nom_tokens, nom_accounts
      RESTART IDENTITY CASCADE`,
  );
  await db('nom_accounts').insert(
    ['z1owner', 'z1alice', 'z1bob', 'z1carol'].map((address) => ({ address })),
  );
  await db('nom_tokens').insert([
    {
      owner_id: OWNER,
      name: 'ZNN',
      symbol: 'ZNN',
      domain: '',
      token_standard: ZNN_TOKEN_STANDARD,
      decimals: 8,
    },
    {
      owner_id: OWNER,
      name: 'QSR',
      symbol: 'QSR',
      domain: '',
      token_standard: 'zts1qsrxxxxxxxxxxxxxmrhjll',
      decimals: 8,
    },
  ]);
  tokenRegistry.clear();
  tokenRegistry.set(ZNN_TOKEN_STANDARD, ZNN);
});

async function pillar(name: string, createdAt = at(0)): Promise<number> {
  const [row] = await db('nom_pillars')
    .insert({
      owner_id: OWNER,
      producer_account_id: OWNER,
      withdraw_account_id: OWNER,
      name,
      slug: name.toLowerCase(),
      created_at: createdAt,
    })
    .returning('id');
  return row.id;
}

const pillars = () =>
  db('nom_pillars')
    .orderBy('id')
    .select(
      'name',
      'weight',
      'rank',
      'produced_momentums',
      'total_momentums_produced',
      'az_engagement',
      'az_avg_vote_time',
    );

function ctx(accountId: number, decoded: Record<string, unknown> = {}): ActionContext {
  return {
    tx: db as any,
    receiveBlock: { id: 1, momentumId: 1, createdAt: at(0) },
    frontierMomentum: { height: 1n, timestamp: at(0) },
    sendBlock: {
      id: 1,
      accountId,
      toAccountId: OWNER,
      tokenId: null,
      amount: '0',
      hash: 'h',
      createdAt: at(0),
    },
    decoded,
  };
}

const credit = (account: number, token: number, amount: bigint) =>
  updateAccountTokenBalance(db, account, token, amount, at(0));

describe('pillar weight', () => {
  it('is the summed ZNN balance of the active delegators', async () => {
    await pillar('Alpha');
    await pillar('Beta');
    await credit(ALICE, ZNN, 500n);
    await credit(BOB, ZNN, 300n);

    await delegate(ctx(ALICE, { name: 'Alpha' }));
    await delegate(ctx(BOB, { name: 'Alpha' }));
    await credit(ALICE, ZNN, 50n); // a delegator's balance change
    await credit(ALICE, QSR, 999n); // QSR does not count
    await credit(CAROL, ZNN, 700n); // not a delegator
    expect((await pillars()).map((p) => p.weight)).toEqual(['850', '0']);

    await delegate(ctx(BOB, { name: 'Beta' })); // moves to another pillar
    expect((await pillars()).map((p) => p.weight)).toEqual(['550', '300']);

    await undelegate(ctx(ALICE));
    await credit(ALICE, ZNN, -100n); // no longer counted
    expect((await pillars()).map((p) => p.weight)).toEqual(['0', '300']);
  });

  it('stays 0 for a revoked pillar while its delegators keep trading', async () => {
    await pillar('Alpha');
    await credit(ALICE, ZNN, 500n);
    await delegate(ctx(ALICE, { name: 'Alpha' }));

    await revoke(ctx(OWNER, { name: 'Alpha' }));
    await credit(ALICE, ZNN, 100n);

    expect((await pillars())[0].weight).toBe('0');
  });
});

describe('pillar rank', () => {
  it('orders active pillars by weight, then by name in byte order, from 0', async () => {
    const ids = [
      await pillar('beta'),
      await pillar('Alpha'),
      await pillar('Gamma'),
      await pillar('Revoked'),
    ];
    await db('nom_pillars').where({ id: ids[2] }).update({ weight: '900' });
    await db('nom_pillars')
      .where({ id: ids[3] })
      .update({ revoked_at: at(0), rank: 42 });

    markPillarRanksDirty(db);
    await refreshPillarRanks(db);

    // 'A' sorts before 'b' in byte order. A revoked pillar keeps its rank.
    expect((await pillars()).map((p) => [p.name, p.rank])).toEqual([
      ['beta', 2],
      ['Alpha', 1],
      ['Gamma', 0],
      ['Revoked', 42],
    ]);
  });

  it('runs only when the transaction changed something', async () => {
    const id = await pillar('Alpha');
    await db('nom_pillars').where({ id }).update({ rank: 5 });

    await refreshPillarRanks(db);

    expect((await pillars())[0].rank).toBe(5);
  });
});

describe('momentum production', () => {
  async function momentum(height: bigint, ms: number, pillarId: number | null) {
    await db('nom_momentums').insert({
      producer_account_id: OWNER,
      producer_pillar_id: pillarId,
      version: 1,
      height,
      hash: `m${height}`,
      created_at: at(ms),
    });
    await recordPillarProduction(db, pillarId, height, at(ms));
  }

  it('counts the current epoch and the lifetime total, resetting at each epoch', async () => {
    const alpha = await pillar('Alpha');
    const beta = await pillar('Beta');

    await momentum(1n, 0, null);
    await momentum(2n, 10_000, alpha);
    await momentum(3n, 20_000, beta);
    await momentum(4n, DAY - 10_000, alpha);
    expect(
      (await pillars()).map((p) => [p.produced_momentums, Number(p.total_momentums_produced)]),
    ).toEqual([
      [2, 2],
      [1, 1],
    ]);

    await momentum(5n, DAY, alpha); // first momentum of epoch 1
    expect(
      (await pillars()).map((p) => [p.produced_momentums, Number(p.total_momentums_produced)]),
    ).toEqual([
      [1, 3],
      [0, 1],
    ]);
  });
});

describe('Accelerator-Z engagement', () => {
  let item = 0;
  async function project(ms: number): Promise<number> {
    const [row] = await db('nom_accelerator_projects')
      .insert({
        owner_id: OWNER,
        hash: `p${++item}`,
        name: `P${item}`,
        slug: `p${item}`,
        url: '',
        description: '',
        created_at: at(ms),
      })
      .returning('id');
    return row.id;
  }
  async function phase(projectId: number, ms: number): Promise<number> {
    const [row] = await db('nom_accelerator_phases')
      .insert({
        project_id: projectId,
        hash: `ph${++item}`,
        name: `Ph${item}`,
        slug: `ph${item}`,
        url: '',
        description: '',
        created_at: at(ms),
      })
      .returning('id');
    return row.id;
  }
  const vote = (pillarId: number, type: string, id: number, ms: number) =>
    db('nom_votes').insert({
      owner_id: OWNER,
      pillar_id: pillarId,
      votable_type: type,
      votable_id: id,
      vote: 0,
      created_at: at(ms),
    });

  it('is the share of items since registration the pillar voted on, and its mean vote delay', async () => {
    const before = await project(0);
    const alpha = await pillar('Alpha', at(1_000));
    const p1 = await project(2_000);
    const p2 = await project(3_000);
    const ph = await phase(p1, 4_000);
    await vote(alpha, 'AcceleratorProject', before, 10_000); // before registration
    await vote(alpha, 'AcceleratorProject', p1, 12_000);
    await vote(alpha, 'AcceleratorPhase', ph, 7_000);

    await refreshPillarEngagement(db);

    const [row] = await pillars();
    // 2 of the 3 items since registration (p1, ph; not p2).
    expect(Number(row.az_engagement)).toBe(66.7);
    // (10 + 10 + 3) s / 3 votes, rounded.
    expect(Number(row.az_avg_vote_time)).toBe(8);
    expect(p2).toBeGreaterThan(0);
  });

  it('keeps the values of a pillar with no items since it registered', async () => {
    await project(0);
    await pillar('Alpha', at(1_000));

    await refreshPillarEngagement(db);

    expect((await pillars())[0].az_engagement).toBeNull();
  });

  it('counts only the items created while a revoked pillar was active', async () => {
    const alpha = await pillar('Alpha', at(1_000));
    const p1 = await project(2_000);
    await project(3_000);
    await db('nom_pillars')
      .where({ id: alpha })
      .update({ revoked_at: at(4_000) });
    await project(5_000); // after the revocation
    await vote(alpha, 'AcceleratorProject', p1, 2_500);

    await refreshPillarEngagement(db, [alpha]);
    const refreshed = await pillars();
    // 1 of the 2 items created while active.
    expect(Number(refreshed[0].az_engagement)).toBe(50);
    expect(Number(refreshed[0].az_avg_vote_time)).toBe(1);
  });
});
