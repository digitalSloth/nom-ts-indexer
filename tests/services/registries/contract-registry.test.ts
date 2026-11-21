import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';

let mockDb: MockKnex;

vi.mock('../../../src/services/database.js', () => ({
  databaseService: {
    getDb: () => mockDb,
  },
}));

const { contractRegistry } = await import('../../../src/services/registries/contract-registry.js');

describe('ContractRegistry', () => {
  beforeEach(async () => {
    mockDb = makeMockKnex();
    // Reload with empty data
    mockDb.resolveNext([]); // contracts
    mockDb.resolveNext([]); // methods
    await contractRegistry.load();
  });

  it('loads contracts and methods from database', async () => {
    // The beforeEach already loaded with empty data. Now reload with real data.
    // For the contracts query (simple select), resolveNext returns the array.
    // For the methods query (leftJoin), resolveNext returns the array.
    mockDb.resolveNext([
      { name: 'Stake', account_id: 10 },
      { name: 'Bridge', account_id: 20 },
    ]);
    mockDb.resolveNext([
      { id: 1, name: 'stakeTokens', fingerprint: 'abc', contract_name: 'Stake' },
      { id: 2, name: 'wrapToken', fingerprint: 'def', contract_name: 'Bridge' },
      { id: 3, name: 'commonMethod', fingerprint: 'ghi', contract_name: null },
    ]);

    await contractRegistry.load();

    expect(contractRegistry.isLoaded()).toBe(true);
    expect(contractRegistry.getContractName(10)).toBe('Stake');
    expect(contractRegistry.getContractName(20)).toBe('Bridge');
    expect(contractRegistry.getContractName(999)).toBe('Common');
  });

  it('getMethodId returns correct id', async () => {
    mockDb.resolveNext([]);
    mockDb.resolveNext([
      { id: 42, name: 'doThing', fingerprint: '0xabc', contract_name: 'MyContract' },
    ]);
    await contractRegistry.load();

    expect(contractRegistry.getMethodId('MyContract', '0xabc')).toBe(42);
    expect(contractRegistry.getMethodId('MyContract', '0xunknown')).toBeNull();
    expect(contractRegistry.getMethodId('Unknown', '0xabc')).toBeNull();
  });

  it('getMethod returns method info', async () => {
    mockDb.resolveNext([]);
    mockDb.resolveNext([{ id: 7, name: 'doStuff', fingerprint: '0xff', contract_name: 'Foo' }]);
    await contractRegistry.load();

    expect(contractRegistry.getMethod(7)).toEqual({
      contractName: 'Foo',
      methodName: 'doStuff',
    });
    expect(contractRegistry.getMethod(999)).toBeUndefined();
  });

  it('uses "Common" for methods without a contract', async () => {
    mockDb.resolveNext([]);
    mockDb.resolveNext([{ id: 1, name: 'generic', fingerprint: '0x1', contract_name: null }]);
    await contractRegistry.load();

    expect(contractRegistry.getMethodId('Common', '0x1')).toBe(1);
    expect(contractRegistry.getMethod(1)).toEqual({
      contractName: 'Common',
      methodName: 'generic',
    });
  });

  it('isLoaded returns true after load', async () => {
    expect(contractRegistry.isLoaded()).toBe(true);
  });
});
