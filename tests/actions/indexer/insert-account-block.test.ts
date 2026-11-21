import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';
import { makeMockAccountBlock } from '../../helpers/mock-zenon.js';
import { accountRegistry } from '../../../src/services/registries/account-registry.js';

const dispatchAction = vi.fn();
const getContractName = vi.fn();
const getMethodId = vi.fn();
const getMethod = vi.fn();
const getEmbeddedContractByName = vi.fn();
const tokenRegistryGetOrLoad = vi.fn(async () => null);
const linkPairedAccountBlock = vi.fn();

const mockMomentumEvent = {
  momentumId: 200,
  height: 100n,
  hash: 'momentum_hash',
  timestamp: 1700000000,
};

vi.mock('../../../src/actions/process/index.js', () => ({
  dispatchAction: (...args: any[]) => dispatchAction(...args),
}));

vi.mock('../../../src/actions/indexer/pillar-metrics.js', () => ({
  applyDelegatorBalanceChange: vi.fn(),
}));
vi.mock('../../../src/actions/indexer/link-paired-account-block.js', () => ({
  linkPairedAccountBlock: (...args: any[]) => linkPairedAccountBlock(...args),
}));

vi.mock('../../../src/services/registries/contract-registry.js', () => ({
  contractRegistry: {
    getContractName: (...args: any[]) => getContractName(...args),
    getMethodId: (...args: any[]) => getMethodId(...args),
    getMethod: (...args: any[]) => getMethod(...args),
  },
}));

vi.mock('../../../src/constants/zenon.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getEmbeddedContractByName: (...args: any[]) => getEmbeddedContractByName(...args),
  };
});

vi.mock('../../../src/services/registries/token-registry.js', () => ({
  tokenRegistry: {
    getOrLoad: (...args: any[]) => tokenRegistryGetOrLoad(...args),
  },
}));

let insertAccountBlock: typeof import('../../../src/actions/indexer/insert-account-block.js').insertAccountBlock;

beforeEach(async () => {
  ({ insertAccountBlock } = await import('../../../src/actions/indexer/insert-account-block.js'));
  dispatchAction.mockReset();
  getContractName.mockReset();
  getMethodId.mockReset();
  getEmbeddedContractByName.mockReset();
  tokenRegistryGetOrLoad.mockReset();
  tokenRegistryGetOrLoad.mockResolvedValue(null);
  linkPairedAccountBlock.mockReset();
  accountRegistry.clear();
});

describe('insertAccountBlock', () => {
  let tx: MockKnex;

  beforeEach(() => {
    tx = makeMockKnex();
  });

  function setupCommonMocks() {
    tx.resolveNext(null); // 1. existing block check
    tx.resolveNext({ id: 10 }); // 2. accountRegistry.getOrCreate from
    tx.resolveNext({ id: 10 }); // 3. accountRegistry.getOrCreate to
    tx.resolveNext({ id: 200 }); // 4. momentum lookup
    tx.resolveNext({ id: 201, height: '99', created_at: new Date(1699999990 * 1000) }); // 5. ack momentum lookup
    tx.resolveNext(undefined); // 6. account update
    tx.resolveNext({ id: 999 }); // 7. insert account block
  }

  it('returns null when upsert finds an existing block', async () => {
    tx.resolveNext({ id: 555 });

    const result = await insertAccountBlock(tx, makeMockAccountBlock(), mockMomentumEvent);

    expect(result).toBeNull();
  });

  it('throws when confirmationDetail is missing', async () => {
    const block = makeMockAccountBlock({ confirmationDetail: null });

    await expect(insertAccountBlock(tx, block, mockMomentumEvent)).rejects.toThrow(
      /confirmation detail/,
    );
  });

  it('throws when momentum is not found', async () => {
    tx.resolveNext(null); // existing block check
    tx.resolveNext({ id: 10 }); // accountRegistry.getOrCreate from
    tx.resolveNext({ id: 10 }); // accountRegistry.getOrCreate to
    tx.resolveNext(null); // momentum lookup → null

    await expect(insertAccountBlock(tx, makeMockAccountBlock(), mockMomentumEvent)).rejects.toThrow(
      /Momentum not found/,
    );
  });

  it('runs inline account update and creates block', async () => {
    setupCommonMocks();

    const block = makeMockAccountBlock({
      publicKey: { toString: () => 'pk1' },
      height: 7,
      fusedPlasma: 1,
      basePlasma: 2,
      usedPlasma: 3,
      difficulty: 4,
    });

    await insertAccountBlock(tx, block, mockMomentumEvent);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    expect(builder.onConflict).toHaveBeenCalled();

    // dispatchAction not called — no paired block or data
    expect(dispatchAction).not.toHaveBeenCalled();
  });

  it('resolves momentum id from DB every time', async () => {
    setupCommonMocks();

    await insertAccountBlock(tx, makeMockAccountBlock(), mockMomentumEvent);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
  });

  it('resolves tokenId via tokenRegistry when token is present', async () => {
    setupCommonMocks();
    tokenRegistryGetOrLoad.mockResolvedValue(42);

    const block = makeMockAccountBlock({
      token: { tokenStandard: { toString: () => 'zts1znnxxxxxxxxxxxxx9z4ulx' } },
    });

    await insertAccountBlock(tx, block, mockMomentumEvent);

    expect(tokenRegistryGetOrLoad).toHaveBeenCalledWith(tx, 'zts1znnxxxxxxxxxxxxx9z4ulx');
  });

  it('sets tokenId to null when no token on block', async () => {
    setupCommonMocks();

    await insertAccountBlock(tx, makeMockAccountBlock({ token: null }), mockMomentumEvent);

    expect(tokenRegistryGetOrLoad).not.toHaveBeenCalled();
  });

  it('passes non-zero amount as string to insert', async () => {
    setupCommonMocks();

    const block = makeMockAccountBlock({ amount: BigInt('1000000000') });
    await insertAccountBlock(tx, block, mockMomentumEvent);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall.amount).toBe('1000000000');
  });

  it('stores raw data with null decoded when data is shorter than 4 bytes', async () => {
    setupCommonMocks();

    const data = Buffer.from([0xde, 0xad]);
    const block = makeMockAccountBlock({ data });
    await insertAccountBlock(tx, block, mockMomentumEvent);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
  });

  it('returns null early without further processing (re-run short-circuit)', async () => {
    tx.resolveNext({ id: 777 }); // existing block found

    const result = await insertAccountBlock(tx, makeMockAccountBlock(), mockMomentumEvent);

    expect(result).toBeNull();
    expect(dispatchAction).not.toHaveBeenCalled();
  });

  it('writes accountBlockData with decoded JSON when method matches', async () => {
    setupCommonMocks();
    getContractName.mockReturnValue('Plasma Contract');
    getMethodId.mockReturnValue(42);
    getEmbeddedContractByName.mockReturnValue({
      contractClass: {
        decodeCallData: () => ({ args: { foo: 'bar' } }),
      },
    });

    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01]);
    const block = makeMockAccountBlock({ data });

    await insertAccountBlock(tx, block, mockMomentumEvent);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
  });

  it('stores raw data with null decoded when decode throws', async () => {
    setupCommonMocks();
    getContractName.mockReturnValue('Plasma Contract');
    getMethodId.mockReturnValue(42);
    getEmbeddedContractByName.mockReturnValue({
      contractClass: {
        decodeCallData: () => {
          throw new Error('boom');
        },
      },
    });

    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const block = makeMockAccountBlock({ data });

    await insertAccountBlock(tx, block, mockMomentumEvent);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
  });

  describe('liquidity program rewards', () => {
    const QSR = 'zts1qsrxxxxxxxxxxxxxmrhjll';
    const ZNN = 'zts1znnxxxxxxxxxxxxx9z4ulx';

    function runSend(fromAddress: string, tokenStandard: string) {
      tx.resolveNext(null); // existing block check
      tx.resolveNext({ id: 10 }); // accountRegistry.getOrCreate from
      tx.resolveNext({ id: 20 }); // accountRegistry.getOrCreate to
      tx.resolveNext({ id: 200 }); // momentum lookup
      tx.resolveNext({ id: 201 }); // ack momentum lookup
      tx.resolveNext(undefined); // account update
      tx.resolveNext({ id: 999 }); // insert account block
      tx.resolveNext(null); // sender balance lookup
      tx.resolveNext({}); // sender balance upsert
      tokenRegistryGetOrLoad.mockResolvedValue(42);

      const block = makeMockAccountBlock({
        blockType: 2, // UserSend
        address: { toString: () => fromAddress },
        token: { tokenStandard: { toString: () => tokenStandard } },
        amount: 7500000000n,
      });
      return insertAccountBlock(tx, block, mockMomentumEvent);
    }

    it('records a reward for the receiver of a QSR send from the distributor', async () => {
      await runSend('z1qqw8f3qxx9zg92xgckqdpfws3dw07d26afsj74', QSR);

      const insertCall = (tx.lastBuilder().insert as any).mock.calls[0][0];
      expect(insertCall).toEqual({
        account_id: 20,
        token_id: 42,
        account_block_id: 999,
        type: 'liquidity_program',
        amount: '7500000000',
        created_at: new Date(1700000000 * 1000),
      });
    });

    it('records no reward for a ZNN send from the distributor', async () => {
      await runSend('z1qqw8f3qxx9zg92xgckqdpfws3dw07d26afsj74', ZNN);

      const insertCall = (tx.lastBuilder().insert as any).mock.calls[0][0];
      expect(insertCall).not.toHaveProperty('type');
    });

    it('records no reward for a QSR send from another address', async () => {
      await runSend('z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7', QSR);

      const insertCall = (tx.lastBuilder().insert as any).mock.calls[0][0];
      expect(insertCall).not.toHaveProperty('type');
    });
  });

  it('debits a send from the token contract', async () => {
    setupCommonMocks();
    tx.resolveNext({ balance: '9000000000', sent: '0', received: '9000000000' }); // balance lookup
    tokenRegistryGetOrLoad.mockResolvedValue(42);

    const block = makeMockAccountBlock({
      blockType: 4, // ContractSend
      address: { toString: () => 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0' },
      token: { tokenStandard: { toString: () => 'zts1znnxxxxxxxxxxxxx9z4ulx' } },
      amount: 7500000000n,
    });
    await insertAccountBlock(tx, block, mockMomentumEvent);

    expect(tx.lastBuilder().insert).toHaveBeenCalledWith({
      account_id: 10,
      token_id: 42,
      balance: '1500000000',
      sent: '7500000000',
      received: '9000000000',
      updated_at: new Date(1700000000 * 1000),
    });
  });

  describe('contract call status', () => {
    const pairedSend = {
      id: 500,
      accountId: 10,
      toAccountId: 20,
      tokenId: null,
      blockType: 2,
      amount: '0',
      hash: 'sendhash',
      createdAt: new Date(1700000000 * 1000),
      contractMethodId: 7,
      momentumId: 199,
    };

    /** Every update that set the failed flag, by the row it targeted. */
    function flaggedRows(): unknown[] {
      return updates
        .filter((b) =>
          b.update.mock.calls.some(([v]: [unknown]) => (v as any)?.call_failed === true),
        )
        .map((b) => b.where.mock.calls[0]?.[0]);
    }

    let updates: any[] = [];

    function recordBuilders() {
      updates = [];
      const inner = tx;
      const recorded = Object.assign((table: string) => {
        const builder = inner(table);
        updates.push(builder);
        return builder;
      }, tx);
      tx = recorded as MockKnex;
    }

    function runContractReceive(statusHex: string) {
      recordBuilders();
      setupCommonMocks();
      getMethodId.mockReturnValue(null);
      linkPairedAccountBlock.mockResolvedValue(pairedSend);

      const block = makeMockAccountBlock({
        blockType: 5, // ContractReceive
        data: Buffer.from(statusHex, 'hex'),
        pairedAccountBlock: { hash: { toString: () => 'sendhash' } },
      });
      return insertAccountBlock(tx, block, mockMomentumEvent);
    }

    it('dispatches a successful call and stores its status', async () => {
      const event = await runContractReceive('0000000000000001');

      expect(dispatchAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ id: 999 }),
        pairedSend,
        { height: 99n, timestamp: new Date(1699999990 * 1000) },
      );
      expect(event?.callStatus).toBe(1);
    });

    it('does not dispatch a failed call and stores its status', async () => {
      const event = await runContractReceive('0000000000000002');

      expect(dispatchAction).not.toHaveBeenCalled();
      expect(event?.callStatus).toBe(2);
    });

    it('flags the send of a failed call', async () => {
      await runContractReceive('0000000000000002');

      expect(flaggedRows()).toEqual([{ id: 500 }]);
    });

    it('leaves the send of a successful call unflagged', async () => {
      await runContractReceive('0000000000000001');

      expect(flaggedRows()).toEqual([]);
    });

    it('reads the flag from the receive when a send lands after it', async () => {
      setupCommonMocks();
      getMethodId.mockReturnValue(null);
      linkPairedAccountBlock.mockResolvedValue({ ...pairedSend, id: 600, blockType: 5 });

      const block = makeMockAccountBlock({
        blockType: 2, // UserSend
        pairedAccountBlock: { hash: { toString: () => 'receivehash' } },
      });
      await insertAccountBlock(tx, block, mockMomentumEvent);

      expect(tx.raw).toHaveBeenCalledWith(
        'EXISTS (SELECT 1 FROM nom_account_blocks r WHERE r.id = ? AND r.call_status = ?)',
        [600, 2],
      );
    });
  });
});
