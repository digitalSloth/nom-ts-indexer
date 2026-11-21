import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMockTx } from '../../helpers/mock-action-context.js';
import type { LinkedBlock } from '../../../src/actions/indexer/insert-account-block.js';

// Mock the contract registry
const getMethod = vi.fn();
vi.mock('../../../src/services/registries/contract-registry.js', () => ({
  contractRegistry: {
    getMethod: (...args: any[]) => getMethod(...args),
  },
}));

// Mock the registry
const getHandlerFn = vi.fn();
const warnMissingOnceFn = vi.fn();
vi.mock('../../../src/actions/process/registry.js', () => ({
  getHandler: (...args: any[]) => getHandlerFn(...args),
  warnMissingOnce: (...args: any[]) => warnMissingOnceFn(...args),
  keyFor: (c: string, m: string) => `${c}.${m}`,
  registerHandler: vi.fn(),
}));

const FRONTIER = { height: 99n, timestamp: new Date('2024-01-02') };

let dispatchAction: typeof import('../../../src/actions/process/dispatcher.js').dispatchAction;

beforeEach(async () => {
  vi.resetModules();
  ({ dispatchAction } = await import('../../../src/actions/process/dispatcher.js'));
  getMethod.mockReset();
  getHandlerFn.mockReset();
  warnMissingOnceFn.mockReset();
});

function makeLinkedBlock(overrides: Partial<LinkedBlock> = {}): LinkedBlock {
  return {
    id: 10,
    accountId: 1,
    toAccountId: 2,
    tokenId: 5,
    blockType: 2, // UserSend
    amount: '1000',
    hash: 'sendblockhash',
    createdAt: new Date('2024-01-01'),
    contractMethodId: 5,
    momentumId: 100,
    ...overrides,
  };
}

function makeReceiveBlock(overrides: Partial<LinkedBlock> = {}): LinkedBlock {
  return {
    id: 1,
    accountId: 3,
    toAccountId: 4,
    tokenId: null,
    blockType: 3, // UserReceive
    amount: '0',
    hash: 'receiveblockhash',
    createdAt: new Date('2024-01-02'),
    contractMethodId: null,
    momentumId: 100,
    ...overrides,
  };
}

describe('dispatchAction', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('returns early when contractMethodId is null', async () => {
    getMethod.mockReturnValue(null);
    const send = makeLinkedBlock({ contractMethodId: null });
    await dispatchAction(tx, makeReceiveBlock(), send, FRONTIER);
    expect(getHandlerFn).not.toHaveBeenCalled();
  });

  it('returns early when method not found in registry', async () => {
    getMethod.mockReturnValue(null);
    await dispatchAction(tx, makeReceiveBlock(), makeLinkedBlock(), FRONTIER);
    expect(getHandlerFn).not.toHaveBeenCalled();
  });

  it('returns early when handler not registered', async () => {
    getMethod.mockReturnValue({ contractName: 'Pillar Contract', methodName: 'Register' });
    getHandlerFn.mockReturnValue(undefined);
    await dispatchAction(tx, makeReceiveBlock(), makeLinkedBlock(), FRONTIER);
    expect(warnMissingOnceFn).toHaveBeenCalledWith('Pillar Contract', 'Register');
  });

  it('throws when the send block has no decoded data', async () => {
    getMethod.mockReturnValue({ contractName: 'C', methodName: 'M' });
    getHandlerFn.mockReturnValue(vi.fn());
    tx.resolveNext(null); // DB query for decoded data
    await expect(
      dispatchAction(tx, makeReceiveBlock(), makeLinkedBlock(), FRONTIER),
    ).rejects.toThrow(/C\.M: send block sendblockhash has no decoded data/);
  });

  it('throws when decoded JSON is invalid', async () => {
    getMethod.mockReturnValue({ contractName: 'C', methodName: 'M' });
    getHandlerFn.mockReturnValue(vi.fn());
    tx.resolveNext({ decoded: 'not-json' }); // DB query for decoded data
    await expect(
      dispatchAction(tx, makeReceiveBlock(), makeLinkedBlock(), FRONTIER),
    ).rejects.toThrow();
  });

  it('calls handler with correct ActionContext', async () => {
    const handler = vi.fn();
    getMethod.mockReturnValue({ contractName: 'Pillar Contract', methodName: 'Register' });
    getHandlerFn.mockReturnValue(handler);

    const send = makeLinkedBlock();
    const receive = makeReceiveBlock();

    tx.resolveNext({ decoded: '{"name":"MyPillar","amount":"100"}' }); // DB query for decoded data
    await dispatchAction(tx, receive, send, FRONTIER);

    expect(handler).toHaveBeenCalledWith({
      tx,
      receiveBlock: {
        id: 1,
        momentumId: 100,
        createdAt: new Date('2024-01-02'),
      },
      frontierMomentum: FRONTIER,
      sendBlock: {
        id: 10,
        accountId: 1,
        toAccountId: 2,
        tokenId: 5,
        amount: '1000',
        hash: 'sendblockhash',
        createdAt: new Date('2024-01-01'),
      },
      decoded: { name: 'MyPillar', amount: '100' },
    });
  });
});
