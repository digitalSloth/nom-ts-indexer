import { vi } from 'vitest';

const stringy = (s: string) => ({ toString: () => s });

export function makeMockToken(overrides: Partial<any> = {}): any {
  return {
    name: 'Zenon',
    symbol: 'ZNN',
    domain: 'zenon.network',
    tokenStandard: stringy('zts1znnxxxxxxxxxxxxx9z4ulx'),
    owner: stringy('z1qxemdeddedxstakexxxxxxxxxxxxxxxx9z4ulx'),
    totalSupply: BigInt(1000),
    maxSupply: BigInt(2000),
    decimals: 8,
    isBurnable: true,
    isMintable: false,
    isUtility: false,
    ...overrides,
  };
}

export function makeMockMomentum(overrides: Partial<any> = {}): any {
  return {
    height: 100,
    hash: stringy('aaa111'),
    producer: stringy('z1producer'),
    version: 1,
    timestamp: 1700000000,
    data: null,
    content: [],
    ...overrides,
  };
}

export function makeMockAccountBlock(overrides: Partial<any> = {}): any {
  return {
    hash: stringy('blockhash1'),
    address: stringy('z1addr_from'),
    toAddress: stringy('z1addr_to'),
    publicKey: null,
    token: null,
    version: 1,
    blockType: 2,
    height: 1,
    amount: BigInt(0),
    fusedPlasma: 0,
    basePlasma: 0,
    usedPlasma: 0,
    difficulty: 0,
    nonce: null,
    data: null,
    descendantBlocks: [],
    pairedAccountBlock: null,
    confirmationDetail: {
      momentumHash: stringy('momentumhash1'),
      momentumTimestamp: 1700000000,
    },
    momentumAcknowledged: {
      hash: stringy('ackhash1'),
    },
    ...overrides,
  };
}

export function makeMockZenonClient(): any {
  return {
    initialize: vi.fn(),
    getFrontierMomentum: vi.fn(),
    getMomentumsByHeight: vi.fn(),
    getMomentumByHash: vi.fn(),
    getAccountBlockByHash: vi.fn(),
    subscribeToMomentums: vi.fn(),
    unsubscribeFromMomentums: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => false),
    getSDK: vi.fn(),
  };
}
