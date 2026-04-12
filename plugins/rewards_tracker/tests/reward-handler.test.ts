import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleReward } from '../src/reward-handler.js';
import type { IndexedAccountBlockEvent, PluginDb } from '../../../src/plugins/types.js';

const PILLAR = 'z1qxemdeddedxpyllarxxxxxxxxxxxxxxxsy3fmg';
const STAKE = 'z1qxemdeddedxstakexxxxxxxxxxxxxxxxjv8v62';
const SENTINEL = 'z1qxemdeddedxsentynelxxxxxxxxxxxxxwy0r2r';
const LIQUIDITY = 'z1qxemdeddedxlyquydytyxxxxxxxxxxxxflaaae';
const ZNN_ZTS = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const QSR_ZTS = 'zts1qsrxxxxxxxxxxxxxmrhjll';

function makeEvent(overrides: Partial<IndexedAccountBlockEvent> = {}): IndexedAccountBlockEvent {
  return {
    accountBlockId: 100,
    hash: 'reward_hash',
    blockType: 5,
    height: 500n,
    fromAddress: PILLAR,
    toAddress: 'z1qzreceiver',
    amount: '1000000000',
    tokenStandard: ZNN_ZTS,
    rawData: Buffer.alloc(0),
    decodedArgs: null,
    momentum: { momentumId: 1, height: 500n, hash: 'mom_hash', timestamp: 1700000000 },
    contractMethod: { contractName: 'Token Contract', methodName: 'Mint' },
    pairedBlockHash: null,
    ...overrides,
  };
}

const ACCOUNT_MAP: Record<number, string> = {
  1: PILLAR,
  2: STAKE,
  3: SENTINEL,
  4: LIQUIDITY,
  5: 'z1qzreceiver',
  6: 'z1qzdelegate',
};

interface MockDb extends PluginDb {
  calls: string[];
  queryResults: unknown[][];
  queryIndex: number;
}

function makeDb(): MockDb {
  const calls: string[] = [];
  const queryResults: unknown[][] = [];
  const state = { queryIndex: 0 };
  return {
    calls,
    queryResults,
    get queryIndex() { return state.queryIndex; },
    set queryIndex(v: number) { state.queryIndex = v; },
    execute: vi.fn(async (sql: string, ..._params: unknown[]) => {
      calls.push(sql);
    }),
    query: vi.fn(async (sql: string, ...params: unknown[]) => {
      // Route by SQL shape
      if (sql.includes('nom_token_mints')) {
        const result = queryResults[state.queryIndex++];
        return result ?? [];
      }
      if (sql.includes('nom_accounts') && sql.includes('WHERE id')) {
        const id = params[0] as number;
        const addr = ACCOUNT_MAP[id];
        return addr ? [{ address: addr }] : [];
      }
      if (sql.includes('nom_pillars')) {
        const result = queryResults[state.queryIndex++];
        return result ?? [];
      }
      if (sql.includes('nom_tokens')) {
        const result = queryResults[state.queryIndex++];
        return result ?? [];
      }
      return [];
    }),
  };
}

describe('handleReward', () => {
  let db: MockDb;

  beforeEach(() => {
    db = makeDb();
  });

  it('records a pillar reward', async () => {
    // mint lookup → issuer=1 (Pillar), receiver=5
    db.queryResults.push(
      [{ issuer_id: 1, receiver_id: 5 }], // nom_token_mints
      [{ id: 1 }],                         // isPillarWithdrawAddress → found
      [{ id: 10 }],                        // nom_tokens
    );

    const event = makeEvent();
    await handleReward(event, db);

    expect(db.execute).toHaveBeenCalledTimes(2); // insert + update
    expect(db.calls[0]).toContain('INSERT INTO rewards_tracker_rewards');
    expect(db.calls[1]).toContain('UPDATE nom_accounts SET znn_rewards');
  });

  it('records a delegate reward when receiver is not a pillar withdraw address', async () => {
    db.queryResults.push(
      [{ issuer_id: 1, receiver_id: 6 }], // nom_token_mints
      [],                                   // isPillarWithdrawAddress → not found
      [{ id: 10 }],                        // nom_tokens
    );

    const event = makeEvent({ toAddress: 'z1qzdelegate' });
    await handleReward(event, db);

    expect(db.execute).toHaveBeenCalledTimes(2);
    // Check the insert uses 'delegate' type
    const insertCall = (db.execute as any).mock.calls[0];
    expect(insertCall[4]).toBe('delegate');
  });

  it('records a stake reward', async () => {
    db.queryResults.push(
      [{ issuer_id: 2, receiver_id: 5 }], // issuer = Stake
      [{ id: 10 }],                        // nom_tokens
    );

    const event = makeEvent({ fromAddress: STAKE });
    await handleReward(event, db);

    expect(db.execute).toHaveBeenCalledTimes(2);
    const insertCall = (db.execute as any).mock.calls[0];
    expect(insertCall[4]).toBe('stake');
  });

  it('records a sentinel reward', async () => {
    db.queryResults.push(
      [{ issuer_id: 3, receiver_id: 5 }], // issuer = Sentinel
      [{ id: 10 }],                        // nom_tokens
    );

    const event = makeEvent({ fromAddress: SENTINEL });
    await handleReward(event, db);

    const insertCall = (db.execute as any).mock.calls[0];
    expect(insertCall[4]).toBe('sentinel');
  });

  it('records a liquidity reward', async () => {
    db.queryResults.push(
      [{ issuer_id: 4, receiver_id: 5 }], // issuer = Liquidity, receiver != issuer
      [{ id: 10 }],                        // nom_tokens
    );

    const event = makeEvent({ fromAddress: LIQUIDITY });
    await handleReward(event, db);

    const insertCall = (db.execute as any).mock.calls[0];
    expect(insertCall[4]).toBe('liquidity');
  });

  it('skips liquidity reward sent to liquidity contract itself', async () => {
    db.queryResults.push(
      [{ issuer_id: 4, receiver_id: 4 }], // issuer = Liquidity, receiver = Liquidity
    );

    const event = makeEvent({ fromAddress: LIQUIDITY });
    await handleReward(event, db);

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('skips when issuer is not a reward pool', async () => {
    db.queryResults.push(
      [{ issuer_id: 99, receiver_id: 5 }], // unknown issuer
    );

    const event = makeEvent({ fromAddress: 'z1qzunknown' });
    await handleReward(event, db);

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('skips when no mint record exists', async () => {
    db.queryResults.push([]); // no mint found

    await handleReward(makeEvent(), db);

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('skips when token standard is null', async () => {
    db.queryResults.push(
      [{ issuer_id: 1, receiver_id: 5 }],
    );

    const event = makeEvent({ tokenStandard: null });
    await handleReward(event, db);

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('updates qsr_rewards for QSR token', async () => {
    db.queryResults.push(
      [{ issuer_id: 2, receiver_id: 5 }],
      [{ id: 11 }],
    );

    const event = makeEvent({ fromAddress: STAKE, tokenStandard: QSR_ZTS });
    await handleReward(event, db);

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.calls[1]).toContain('qsr_rewards');
  });
});
