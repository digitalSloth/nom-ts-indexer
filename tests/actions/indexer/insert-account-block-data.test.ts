import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';

const getContractName = vi.fn();
const getMethodId = vi.fn();
const getEmbeddedContractByName = vi.fn();

vi.mock('../../../src/services/registries/contract-registry.js', () => ({
  contractRegistry: {
    getContractName: (...args: any[]) => getContractName(...args),
    getMethodId: (...args: any[]) => getMethodId(...args),
  },
}));

vi.mock('../../../src/constants/zenon.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getEmbeddedContractByName: (...args: any[]) => getEmbeddedContractByName(...args),
  };
});

let insertAccountBlockData: typeof import('../../../src/actions/indexer/insert-account-block-data.js').insertAccountBlockData;

beforeEach(async () => {
  ({ insertAccountBlockData } =
    await import('../../../src/actions/indexer/insert-account-block-data.js'));
  getContractName.mockReset();
  getMethodId.mockReset();
  getEmbeddedContractByName.mockReset();
});

describe('insertAccountBlockData', () => {
  let tx: MockKnex;

  beforeEach(() => {
    tx = makeMockKnex();
  });

  function makeBlock(data: any): any {
    return { data };
  }

  it('stores raw data with null decoded when data is shorter than 4 bytes', async () => {
    const data = Buffer.from([0xde, 0xad]);
    const block = makeBlock(data);

    const result = await insertAccountBlockData(tx, 1, 2, block);

    expect(result.rawData).toEqual(data);
    expect(result.decodedArgs).toBeNull();
    expect(result.contractMethodId).toBeNull();
  });

  it('stores raw data with null decoded when method does not match', async () => {
    getContractName.mockReturnValue('Plasma Contract');
    getMethodId.mockReturnValue(null);

    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const result = await insertAccountBlockData(tx, 1, 2, makeBlock(data));

    expect(result.decodedArgs).toBeNull();
    expect(result.contractMethodId).toBeNull();
  });

  it('decodes and stores args when method matches and decode succeeds', async () => {
    getContractName.mockReturnValue('Plasma Contract');
    getMethodId.mockReturnValue(42);
    getEmbeddedContractByName.mockReturnValue({
      contractClass: {
        decodeCallData: () => ({ args: { foo: 'bar' } }),
      },
    });

    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01]);
    const result = await insertAccountBlockData(tx, 1, 2, makeBlock(data));

    expect(result.contractMethodId).toBe(42);
    expect(result.decodedArgs).toEqual({ foo: 'bar' });
  });

  it('stores integers above 2^64 from a real Mint call as exact decimal strings', async () => {
    const { TokenContract } = await import('znn-typescript-sdk');
    const amount = 2n ** 70n + 12345n;
    const callData = TokenContract.encodeCall('Mint', [
      'zts1znnxxxxxxxxxxxxx9z4ulx',
      amount,
      'z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7',
    ]);

    getContractName.mockReturnValue('Token Contract');
    getMethodId.mockReturnValue(7);
    getEmbeddedContractByName.mockReturnValue({ contractClass: TokenContract });

    const data = Buffer.from(callData.replace(/^0x/, ''), 'hex');
    const result = await insertAccountBlockData(tx, 1, 2, makeBlock(data));

    const expected = {
      tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
      amount: amount.toString(),
      receiveAddress: 'z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7',
    };
    expect(result.decodedArgs).toEqual(expected);

    const stored = (tx.lastBuilder().insert as any).mock.calls[0][0];
    expect(JSON.parse(stored.decoded)).toEqual(expected);
  });

  it('stores null decoded when decode throws', async () => {
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
    const result = await insertAccountBlockData(tx, 1, 2, makeBlock(data));

    expect(result.contractMethodId).toBe(42);
    expect(result.decodedArgs).toBeNull();
  });

  it('updates contract_method_id on the account block when method is found', async () => {
    getContractName.mockReturnValue('Plasma Contract');
    getMethodId.mockReturnValue(42);
    getEmbeddedContractByName.mockReturnValue(null);

    const data = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const result = await insertAccountBlockData(tx, 1, 2, makeBlock(data));

    expect(result.contractMethodId).toBe(42);
  });

  it('decodes base64-encoded data input', async () => {
    getContractName.mockReturnValue(null);
    getMethodId.mockReturnValue(null);

    const raw = Buffer.from([0xaa, 0xbb]);
    const base64 = raw.toString('base64');
    const result = await insertAccountBlockData(tx, 1, 2, makeBlock(base64));

    expect(result.rawData).toEqual(raw);
  });
});
