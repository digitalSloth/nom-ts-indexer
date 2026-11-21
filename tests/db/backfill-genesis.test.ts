import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { AccountBlock, Momentum } from 'znn-typescript-sdk';
import { createScratchDatabase, dropScratchDatabase } from './scratch.js';
import {
  backfillGenesis,
  type GenesisSource,
} from '../../src/database/scripts/backfill-genesis.js';
import { insertAccountBlock } from '../../src/actions/indexer/insert-account-block.js';
import { insertMomentum } from '../../src/actions/indexer/insert-momentum.js';
import { accountRegistry } from '../../src/services/registries/account-registry.js';

const SCRATCH = 'backfill_genesis_test';
const GENESIS_TIME = 1739923200;
const LATER_TIME = GENESIS_TIME + 600;

const ZERO_ADDRESS = 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f';
const ADDRESS_A = 'z1qqcam4ycu0ta8333hx38r5j2z3ry9jjfxkc7t5';
const ADDRESS_B = 'z1qpeet8dcjg0m6x6m3tg437wnc42aa2nez2fzth';
const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx';

const hex = (n: number) => n.toString(16).padStart(64, '0');
const MOMENTUM_1 = hex(0xa1);
const MOMENTUM_2 = hex(0xa2);
const ZERO_HASH = hex(0);
const REAL_KEY = Buffer.from('real-public-key-bytes-0123456789');

let db: Knex;

function momentumJson(height: number, hash: string, timestamp: number, content: string[]) {
  return Momentum.fromJson({
    version: 1,
    chainIdentifier: 69,
    hash,
    previousHash: ZERO_HASH,
    height,
    timestamp,
    data: '',
    content: content.map((c) => ({ address: ADDRESS_A, hash: c, height: 1 })),
    changesHash: ZERO_HASH,
    publicKey: '',
    signature: '',
    producer: ZERO_ADDRESS,
  } as never);
}

function blockJson(overrides: Record<string, unknown>) {
  return AccountBlock.fromJson({
    version: 1,
    chainIdentifier: 69,
    blockType: 1,
    hash: hex(1),
    previousHash: ZERO_HASH,
    height: 1,
    momentumAcknowledged: { hash: ZERO_HASH, height: 0 },
    address: ADDRESS_A,
    toAddress: ZERO_ADDRESS,
    amount: '0',
    tokenStandard: 'zts1qqqqqqqqqqqqqqqqtq587y',
    fromBlockHash: ZERO_HASH,
    data: null,
    fusedPlasma: 0,
    difficulty: 0,
    nonce: '',
    publicKey: null,
    signature: null,
    token: null,
    descendantBlocks: [],
    basePlasma: 0,
    usedPlasma: 0,
    changesHash: ZERO_HASH,
    confirmationDetail: {
      numConfirmations: 1,
      momentumHeight: 1,
      momentumHash: MOMENTUM_1,
      momentumTimestamp: GENESIS_TIME,
    },
    pairedAccountBlock: null,
    ...overrides,
  } as never);
}

const genesisBlocks = () => [
  blockJson({ hash: hex(1), address: ADDRESS_A }),
  blockJson({ hash: hex(2), address: ADDRESS_B }),
];

function sourceOf(blocks: AccountBlock[]): GenesisSource {
  const byHash = new Map(blocks.map((b) => [b.hash.toString(), b]));
  return {
    getGenesisMomentum: async () =>
      momentumJson(
        1,
        MOMENTUM_1,
        GENESIS_TIME,
        blocks.map((b) => b.hash.toString()),
      ),
    getAccountBlockByHash: async (hash) => byHash.get(String(hash)) ?? null,
  };
}

async function account(address: string) {
  return db('nom_accounts').where({ address }).first();
}

async function reset() {
  await db.raw(
    'TRUNCATE nom_account_tokens, nom_account_blocks, nom_momentums, nom_tokens, nom_accounts RESTART IDENTITY CASCADE',
  );
  accountRegistry.clear();
}

describe('backfillGenesis', () => {
  beforeAll(async () => {
    db = await createScratchDatabase(SCRATCH);
  });

  afterAll(async () => {
    await dropScratchDatabase(db, SCRATCH);
  });

  beforeEach(reset);

  it('stores momentum 1 and its genesis blocks with no public key', async () => {
    const report = await backfillGenesis(db, sourceOf(genesisBlocks()));

    expect(report).toEqual({ blocks: 2, inserted: 2 });
    const rows = await db('nom_account_blocks as b')
      .join('nom_momentums as m', 'm.id', 'b.momentum_id')
      .where('b.block_type', 1)
      .select('b.height as block_height', 'm.height as momentum_height');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.block_height === '1' && r.momentum_height === '1')).toBe(true);
    expect((await account(ADDRESS_A)).public_key).toBeNull();
    expect((await account(ADDRESS_B)).public_key).toBeNull();
  });

  it('is a no-op on a second run', async () => {
    const source = sourceOf(genesisBlocks());
    await backfillGenesis(db, source);
    const counts = async () => ({
      blocks: Number((await db('nom_account_blocks').count('* as n').first())!.n),
      momentums: Number((await db('nom_momentums').count('* as n').first())!.n),
    });
    const before = await counts();

    const report = await backfillGenesis(db, source);

    expect(report).toEqual({ blocks: 2, inserted: 0 });
    expect(await counts()).toEqual(before);
  });

  it('leaves seeded balances, totals, state and later activity untouched', async () => {
    const [owner] = await db('nom_accounts').insert({ address: ADDRESS_A }).returning('id');
    const [token] = await db('nom_tokens')
      .insert({
        decimals: 8,
        owner_id: owner.id,
        name: 'Zenon',
        symbol: 'ZNN',
        domain: 'zenon.network',
        token_standard: ZNN,
      })
      .returning('id');
    await db('nom_account_tokens').insert({
      account_id: owner.id,
      token_id: token.id,
      balance: '500',
      received: '500',
      updated_at: new Date(),
    });
    const laterActivity = new Date(LATER_TIME * 1000);
    await db('nom_accounts')
      .where({ id: owner.id })
      .update({ last_active_at: laterActivity, public_key: REAL_KEY.toString() });
    const stateBefore = await db('indexer_state').select('*');

    await backfillGenesis(db, sourceOf(genesisBlocks()));

    const balance = await db('nom_account_tokens').where({ account_id: owner.id }).first();
    expect(balance).toMatchObject({ balance: '500', received: '500', sent: '0' });

    const after = await account(ADDRESS_A);
    expect(after.last_active_at).toEqual(laterActivity);
    expect(after.public_key).toBe(REAL_KEY.toString());
    expect(await db('indexer_state').select('*')).toEqual(stateBefore);
  });

  it('keeps the real public key a later block stores after a keyless genesis block', async () => {
    let storedKey = '';
    await db.transaction(async (tx) => {
      const m1 = await insertMomentum(tx, momentumJson(1, MOMENTUM_1, GENESIS_TIME, [hex(1)]));
      await insertAccountBlock(tx, genesisBlocks()[0], m1);
      const m2 = await insertMomentum(tx, momentumJson(2, MOMENTUM_2, LATER_TIME, [hex(3)]));
      const send = blockJson({
        hash: hex(3),
        blockType: 2,
        height: 2,
        toAddress: ADDRESS_B,
        publicKey: REAL_KEY.toString('base64'),
        confirmationDetail: {
          numConfirmations: 1,
          momentumHeight: 2,
          momentumHash: MOMENTUM_2,
          momentumTimestamp: LATER_TIME,
        },
      });
      storedKey = send.publicKey.toString();
      await insertAccountBlock(tx, send, m2);
    });

    const row = await account(ADDRESS_A);
    expect(storedKey).not.toBe('');
    expect(row.public_key).toBe(storedKey);
    expect(row.last_active_at).toEqual(new Date(LATER_TIME * 1000));
  });
});
