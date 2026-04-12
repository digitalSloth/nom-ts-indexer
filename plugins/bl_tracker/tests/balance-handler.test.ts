import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleBlock } from '../src/balance-handler.js';
import type { IndexedAccountBlockEvent, PluginDb } from '../../../src/plugins/types.js';
import { BlockTypeEnum } from 'znn-typescript-sdk';

const ZNN_ZTS = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const QSR_ZTS = 'zts1qsrxxxxxxxxxxxxxmrhjll';
const TOKEN_CONTRACT = 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0';
const BURN_ADDRESS = 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f';

function makeEvent(overrides: Partial<IndexedAccountBlockEvent> = {}): IndexedAccountBlockEvent {
  return {
    accountBlockId: 1,
    hash: 'abc123',
    blockType: BlockTypeEnum.UserSend,
    height: 100n,
    fromAddress: 'z1qzsender',
    toAddress: 'z1qzreceiver',
    amount: '1000000000',
    tokenStandard: ZNN_ZTS,
    rawData: Buffer.alloc(0),
    decodedArgs: null,
    momentum: { momentumId: 1, height: 100n, hash: 'mh1', timestamp: 1000 },
    contractMethod: null,
    pairedBlockHash: 'def456',
    ...overrides,
  };
}

const ACCOUNT_MAP: Record<string, number> = {
  'z1qzsender': 1,
  'z1qzreceiver': 2,
  [TOKEN_CONTRACT]: 3,
};

interface MockDb extends PluginDb {
  calls: string[];
  setQueryResult(rows: unknown[]): void;
}

function makeDb(): MockDb {
  const calls: string[] = [];
  let queryResult: unknown[] = [];
  return {
    calls,
    setQueryResult(rows: unknown[]) { queryResult = rows; },
    execute: vi.fn(async (sql: string, ..._params: unknown[]) => {
      calls.push(sql);
    }),
    query: vi.fn(async (sql: string, ...params: unknown[]) => {
      // Route by SQL shape
      if (sql.includes('nom_accounts') && !sql.includes('nom_account_blocks')) {
        const addr = params[0] as string;
        const id = ACCOUNT_MAP[addr];
        return id != null ? [{ id }] : [];
      }
      return queryResult;
    }),
  };
}

/** Extract the SET columns from an INSERT ON CONFLICT SQL */
function extractColumns(sql: string): string[] {
  const match = sql.match(/INSERT INTO bl_tracker_balances \(account_id, (.+?), updated_at\)/);
  if (!match) return [];
  return match[1].split(', ').map((s) => s.trim());
}

describe('balance-handler', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
  });

  describe('handleTransfer — sender side', () => {
    it('debits ZNN sent from sender', async () => {
      const event = makeEvent({
        blockType: BlockTypeEnum.UserSend,
        amount: '1000000000',
        tokenStandard: ZNN_ZTS,
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(extractColumns(db.calls[0])).toEqual(['znn_balance', 'znn_sent']);
    });

    it('debits QSR sent from sender', async () => {
      const event = makeEvent({
        blockType: BlockTypeEnum.UserSend,
        amount: '500000000',
        tokenStandard: QSR_ZTS,
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(extractColumns(db.calls[0])).toEqual(['qsr_balance', 'qsr_sent']);
    });

    it('skips sends from the token contract address', async () => {
      const event = makeEvent({
        blockType: BlockTypeEnum.ContractSend,
        fromAddress: TOKEN_CONTRACT,
        amount: '1000000000',
        tokenStandard: ZNN_ZTS,
      });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe('handleTransfer — receiver side', () => {
    it('credits ZNN received by receiver', async () => {
      db.setQueryResult([{ amount: '1000000000', tokenStandard: ZNN_ZTS, fromAddress: 'z1qzsender', toAddress: 'z1qzreceiver' }]);
      const event = makeEvent({
        blockType: BlockTypeEnum.UserReceive,
        fromAddress: 'z1qzreceiver',
        toAddress: 'z1qzsender',
        amount: '0',
        tokenStandard: null,
        pairedBlockHash: 'sendhash',
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(extractColumns(db.calls[0])).toEqual(['znn_balance', 'znn_received']);
    });

    it('credits QSR received by receiver (ContractReceive)', async () => {
      db.setQueryResult([{ amount: '500000000', tokenStandard: QSR_ZTS, fromAddress: TOKEN_CONTRACT, toAddress: 'z1qzreceiver' }]);
      const event = makeEvent({
        blockType: BlockTypeEnum.ContractReceive,
        fromAddress: TOKEN_CONTRACT,
        toAddress: 'z1qzreceiver',
        amount: '0',
        tokenStandard: null,
        pairedBlockHash: 'sendhash',
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(extractColumns(db.calls[0])).toEqual(['qsr_balance', 'qsr_received']);
    });

    it('skips receive when pairedBlockHash is null', async () => {
      const event = makeEvent({
        blockType: BlockTypeEnum.UserReceive,
        pairedBlockHash: null,
      });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('skips receive when paired block not found', async () => {
      db.setQueryResult([]);
      const event = makeEvent({
        blockType: BlockTypeEnum.UserReceive,
        pairedBlockHash: 'nonexistent',
      });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('skips receive when paired amount is zero', async () => {
      db.setQueryResult([{ amount: '0', tokenStandard: ZNN_ZTS, fromAddress: 'z1qzsender', toAddress: 'z1qzreceiver' }]);
      const event = makeEvent({
        blockType: BlockTypeEnum.UserReceive,
        pairedBlockHash: 'sendhash',
      });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('skips receive when paired token is not ZNN or QSR', async () => {
      db.setQueryResult([{ amount: '1000000000', tokenStandard: 'zts1unknownxxxxxxxxxxxxxxx', fromAddress: 'z1qzsender', toAddress: 'z1qzreceiver' }]);
      const event = makeEvent({
        blockType: BlockTypeEnum.UserReceive,
        pairedBlockHash: 'sendhash',
      });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe('skips', () => {
    it('skips blocks from the burn address', async () => {
      const event = makeEvent({ fromAddress: BURN_ADDRESS });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('skips blocks with zero amount', async () => {
      const event = makeEvent({ amount: '0' });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('skips non-ZNN/QSR tokens', async () => {
      const event = makeEvent({ tokenStandard: 'zts1unknownxxxxxxxxxxxxxxx' });

      await handleBlock(event, db);

      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe('handleStake', () => {
    it('updates znn_staked for sender', async () => {
      const event = makeEvent({
        blockType: BlockTypeEnum.UserSend,
        amount: '5000000000',
        tokenStandard: ZNN_ZTS,
        contractMethod: { contractName: 'Stake Contract', methodName: 'Stake' },
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(extractColumns(db.calls[0])).toEqual(['znn_staked']);
    });
  });

  describe('handleCancelStake', () => {
    it('decreases znn_staked using original stake amount', async () => {
      db.setQueryResult([{ amount: '5000000000', fromAddress: 'z1qzsender', toAddress: 'z1qzreceiver' }]);
      const event = makeEvent({
        blockType: BlockTypeEnum.ContractReceive,
        amount: '0',
        pairedBlockHash: 'sendhash',
        contractMethod: { contractName: 'Stake Contract', methodName: 'Cancel' },
        decodedArgs: { id: '0xoriginalstakehash' },
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(extractColumns(db.calls[0])).toEqual(['znn_staked']);
    });
  });

  describe('handleFuse', () => {
    it('updates qsr_fused for fuser and plasma_amount for recipient', async () => {
      const event = makeEvent({
        blockType: BlockTypeEnum.UserSend,
        amount: '10000000000',
        tokenStandard: QSR_ZTS,
        contractMethod: { contractName: 'Plasma Contract', methodName: 'Fuse' },
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(extractColumns(db.calls[0])).toEqual(['qsr_fused']);
      expect(extractColumns(db.calls[1])).toEqual(['plasma_amount']);
    });
  });

  describe('handleCancelFuse', () => {
    it('decreases qsr_fused and plasma_amount', async () => {
      db.setQueryResult([{ amount: '10000000000', fromAddress: 'z1qzsender', toAddress: 'z1qzreceiver' }]);
      const event = makeEvent({
        blockType: BlockTypeEnum.ContractReceive,
        amount: '0',
        pairedBlockHash: 'sendhash',
        contractMethod: { contractName: 'Plasma Contract', methodName: 'CancelFuse' },
        decodedArgs: { id: '0xfusehash' },
      });

      await handleBlock(event, db);

      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(extractColumns(db.calls[0])).toEqual(['qsr_fused']);
      expect(extractColumns(db.calls[1])).toEqual(['plasma_amount']);
    });
  });

  describe('transfer symmetry', () => {
    it('send + receive produces matching updates', async () => {
      const sendEvent = makeEvent({
        blockType: BlockTypeEnum.UserSend,
        fromAddress: 'z1qzsender',
        toAddress: 'z1qzreceiver',
        amount: '1000000000',
        tokenStandard: ZNN_ZTS,
      });

      await handleBlock(sendEvent, db);

      db.setQueryResult([{ amount: '1000000000', tokenStandard: ZNN_ZTS, fromAddress: 'z1qzsender', toAddress: 'z1qzreceiver' }]);
      const receiveEvent = makeEvent({
        blockType: BlockTypeEnum.UserReceive,
        fromAddress: 'z1qzreceiver',
        toAddress: 'z1qzsender',
        amount: '0',
        tokenStandard: null,
        pairedBlockHash: 'sendhash',
      });

      await handleBlock(receiveEvent, db);

      expect(db.execute).toHaveBeenCalledTimes(2);
      // First call: sender debit (znn_balance, znn_sent)
      expect(extractColumns(db.calls[0])).toEqual(['znn_balance', 'znn_sent']);
      // Second call: receiver credit (znn_balance, znn_received)
      expect(extractColumns(db.calls[1])).toEqual(['znn_balance', 'znn_received']);
    });
  });
});
