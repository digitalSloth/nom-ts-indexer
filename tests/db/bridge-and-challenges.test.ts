import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { createScratchDatabase, dropScratchDatabase } from './scratch.js';
import { syncContractMethods } from '../../src/database/contract-methods.js';
import { passTimeChallenge } from '../../src/actions/process/bridge/time-challenge.js';
import { BRIDGE_GOVERNANCE } from '../../src/actions/process/bridge/governance.js';
import { settleTimeChallenges } from '../../src/actions/indexer/settle-time-challenges.js';
import { revokeUnwrapRequest } from '../../src/actions/process/bridge/revoke-unwrap-request.js';
import { redeem } from '../../src/actions/process/bridge/redeem.js';
import { tokenRegistry } from '../../src/services/registries/token-registry.js';
import { QSR_TOKEN_STANDARD } from '../../src/constants/zenon.js';
import type { ActionContext } from '../../src/actions/process/types.js';

const SCRATCH = 'bridge_and_challenges_test';
const T0 = Date.parse('2024-01-01T00:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000);

let db: Knex;
let owner: number;
let bridgeAccount: number;

beforeAll(async () => {
  db = await createScratchDatabase(SCRATCH);
});

afterAll(async () => {
  await dropScratchDatabase(db, SCRATCH);
});

beforeEach(async () => {
  await db.raw(
    `TRUNCATE nom_time_challenges, nom_bridge_wraps, nom_bridge_unwraps, nom_bridge_networks, nom_account_blocks,
      nom_momentums, nom_contract_methods, nom_contracts, nom_tokens, nom_accounts
      RESTART IDENTITY CASCADE`,
  );
  await syncContractMethods(db);
  [{ id: owner }] = await db('nom_accounts').insert({ address: 'z1owner' }).returning('id');
  ({ id: bridgeAccount } = await db('nom_accounts')
    .where({ name: 'Bridge Contract' })
    .select('id')
    .first());
  tokenRegistry.clear();
});

async function momentum(height: number, seconds = height * 10): Promise<number> {
  const [row] = await db('nom_momentums')
    .insert({
      producer_account_id: owner,
      version: 1,
      height,
      hash: `m${height}`,
      created_at: at(seconds),
    })
    .returning('id');
  return row.id;
}

function ctx(frontierHeight: bigint, createdAt: Date, decoded = {}): ActionContext {
  return {
    tx: db as any,
    receiveBlock: { id: 1, momentumId: 1, createdAt },
    frontierMomentum: { height: frontierHeight, timestamp: createdAt },
    sendBlock: {
      id: 1,
      accountId: owner,
      toAccountId: bridgeAccount,
      tokenId: null,
      amount: '0',
      hash: 'h',
      createdAt,
    },
    decoded,
  };
}

const challenge = (frontierHeight: bigint, createdAt: Date, params: string, delay = 5) =>
  passTimeChallenge(
    ctx(frontierHeight, createdAt),
    BRIDGE_GOVERNANCE,
    'SetTokenPair',
    params,
    delay,
  );

const challenges = () =>
  db('nom_time_challenges').select('start_height', 'end_height', 'expires_at', 'created_at');

describe('time challenge expiry', () => {
  it('is set by the first momentum after the end height', async () => {
    await challenge(10n, at(100), 'a');
    expect((await challenges())[0].expires_at).toBeNull();

    await momentum(15);
    await settleTimeChallenges(db, 15n, at(150));
    expect((await challenges())[0].expires_at).toBeNull();

    await momentum(16);
    await settleTimeChallenges(db, 16n, at(160));
    expect((await challenges())[0].expires_at).toEqual(at(160));
  });

  it('is set at the start when that momentum is already indexed', async () => {
    await momentum(16);

    await challenge(10n, at(100), 'a');

    expect((await challenges())[0].expires_at).toEqual(at(160));
  });

  it('restarts with the restarting call time and a new expiry', async () => {
    await momentum(16);
    await challenge(10n, at(100), 'a');

    await challenge(20n, at(200), 'b');

    expect(await challenges()).toEqual([
      { start_height: '20', end_height: '25', expires_at: null, created_at: at(200) },
    ]);
  });
});

describe('bridge unwraps', () => {
  let networkId: number;
  let qsr: number;

  beforeEach(async () => {
    [{ id: qsr }] = await db('nom_tokens')
      .insert({
        owner_id: owner,
        name: 'QSR',
        symbol: 'QSR',
        domain: '',
        token_standard: QSR_TOKEN_STANDARD,
        decimals: 8,
      })
      .returning('id');
    [{ id: networkId }] = await db('nom_bridge_networks')
      .insert({
        chain_identifier: 1,
        network_class: 2,
        name: 'Ethereum',
        contract_address: '0x',
        total_qsr_unwrapped: '1000',
        total_qsr_held: '4000',
      })
      .returning('id');
    const [{ id: send }] = await db('nom_account_blocks')
      .insert({
        account_id: owner,
        to_account_id: bridgeAccount,
        momentum_id: await momentum(1),
        block_type: 2,
        height: 1,
        hash: 'unwrap-send',
        created_at: at(0),
      })
      .returning('id');
    await db('nom_bridge_unwraps').insert({
      account_block_id: send,
      bridge_network_id: networkId,
      to_account_id: owner,
      token_id: qsr,
      transaction_hash: '0xtx',
      log_index: 1,
      amount: '300',
      signature: 's',
      created_at: at(0),
    });
  });

  const network = () =>
    db('nom_bridge_networks')
      .where({ id: networkId })
      .select('total_qsr_unwrapped', 'total_qsr_held')
      .first();

  const call = { transactionHash: '0xtx', logIndex: 1 };

  it('count in the network totals when redeemed', async () => {
    await redeem(ctx(1n, at(50), call));

    expect(await network()).toEqual({ total_qsr_unwrapped: '1300', total_qsr_held: '3700' });
    const unwrap = await db('nom_bridge_unwraps').select('redeemed_at', 'updated_at').first();
    expect(unwrap).toEqual({ redeemed_at: at(50), updated_at: at(50) });
  });

  it('leave the network totals when revoked, before or after a redeem', async () => {
    await revokeUnwrapRequest(ctx(1n, at(50), call));
    expect(await network()).toEqual({ total_qsr_unwrapped: '1000', total_qsr_held: '4000' });

    await db('nom_bridge_unwraps').update({ revoked_at: null });
    await redeem(ctx(1n, at(60), call));
    await revokeUnwrapRequest(ctx(1n, at(70), call));

    expect(await network()).toEqual({ total_qsr_unwrapped: '1300', total_qsr_held: '3700' });
    const unwrap = await db('nom_bridge_unwraps').select('revoked_at', 'updated_at').first();
    expect(unwrap).toEqual({ revoked_at: at(70), updated_at: at(70) });
  });
});
