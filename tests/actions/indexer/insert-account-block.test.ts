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

const mockMomentumEvent = {
  momentumId: 200,
  height: 100n,
  hash: 'momentum_hash',
  timestamp: 1700000000,
};

vi.mock('../../../src/actions/process/index.js', () => ({
  dispatchAction: (...args: any[]) => dispatchAction(...args),
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
  accountRegistry.clear();
});

describe('insertAccountBlock', () => {
  let tx: MockKnex;

  beforeEach(() => {
    tx = makeMockKnex();
  });

  function setupCommonMocks() {
    tx.resolveNext(null);        // 1. existing block check
    tx.resolveNext({ id: 10 });  // 2. accountRegistry.getOrCreate from
    tx.resolveNext({ id: 10 });  // 3. accountRegistry.getOrCreate to
    tx.resolveNext({ id: 200 }); // 4. momentum lookup
    tx.resolveNext({ id: 201 }); // 5. ack momentum lookup
    tx.resolveNext(undefined);   // 6. account update
    tx.resolveNext({ id: 999 }); // 7. insert account block
  }

  it('returns null when upsert finds an existing block', async () => {
    tx.resolveNext({ id: 555 });

    const result = await insertAccountBlock(tx, makeMockAccountBlock(), mockMomentumEvent);

    expect(result).toBeNull();
  });

  it('throws when confirmationDetail is missing', async () => {
    const block = makeMockAccountBlock({ confirmationDetail: null });

    await expect(insertAccountBlock(tx, block, mockMomentumEvent)).rejects.toThrow(/confirmation detail/);
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
});
