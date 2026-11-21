import { describe, it, expect, beforeEach, vi } from 'vitest';

const sdkInstance = {
  initialize: vi.fn(),
  ledger: {
    getFrontierMomentum: vi.fn(),
    getMomentumsByHeight: vi.fn(),
    getMomentumByHash: vi.fn(),
    getAccountBlockByHash: vi.fn(),
  },
  subscribe: {
    toMomentums: vi.fn(),
  },
  clearConnection: vi.fn(),
};

const ZenonMock: any = {
  getInstance: vi.fn(() => sdkInstance),
  setChainID: vi.fn(),
};

vi.mock('znn-typescript-sdk', () => ({
  Zenon: ZenonMock,
}));

const zenonConfig = { chainId: 1, wsUrls: ['ws://primary'] };
vi.mock('../../src/config/zenon.js', () => ({ zenonConfig }));

// Real ranking rules, scripted probe results
const probeNode = vi.fn();
vi.mock('../../src/services/node-probe.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/node-probe.js')>()),
  probeNode,
}));

const PRIMARY = 'ws://primary';
const BACKUP = 'ws://backup';

function healthy(frontierHeight = 100n, anchorHash: string | null = 'h50') {
  return { chainId: 1, frontierHeight, anchorHash };
}

/** Script each node's probe result by URL. */
function probes(results: Record<string, unknown>) {
  probeNode.mockImplementation(async (url: string) => {
    const result = results[url];
    if (result instanceof Error) throw result;
    return result;
  });
}

let zenonClient: typeof import('../../src/services/zenon-client.js').zenonClient;

beforeEach(async () => {
  vi.resetModules();
  Object.values(sdkInstance.ledger).forEach((m: any) => m.mockReset());
  sdkInstance.initialize.mockReset();
  sdkInstance.subscribe.toMomentums.mockReset();
  sdkInstance.clearConnection.mockReset();
  ZenonMock.getInstance.mockClear();
  ZenonMock.setChainID.mockClear();
  zenonConfig.wsUrls = [PRIMARY];
  probeNode.mockReset();
  probes({ [PRIMARY]: healthy() });
  ({ zenonClient } = await import('../../src/services/zenon-client.js'));
});

describe('zenonClient', () => {
  it('initialize() calls SDK initialize once', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);

    await zenonClient.initialize();
    await zenonClient.initialize();

    expect(sdkInstance.initialize).toHaveBeenCalledTimes(1);
    expect(sdkInstance.initialize).toHaveBeenCalledWith(expect.any(String), 30000);
    expect(zenonClient.isConnected()).toBe(true);
  });

  it('methods throw before initialize', async () => {
    await expect(zenonClient.getFrontierMomentum()).rejects.toThrow(/not initialized/);
  });

  it('getFrontierMomentum delegates and wraps errors', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();

    sdkInstance.ledger.getFrontierMomentum.mockResolvedValue({ height: 1 });
    const result = await zenonClient.getFrontierMomentum();
    expect(result).toEqual({ height: 1 });

    sdkInstance.ledger.getFrontierMomentum.mockRejectedValue(new Error('rpc down'));
    await expect(zenonClient.getFrontierMomentum()).rejects.toThrow(/Failed to fetch frontier/);
  });

  it('getMomentumsByHeight delegates with args', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();

    sdkInstance.ledger.getMomentumsByHeight.mockResolvedValue({ list: [] });
    await zenonClient.getMomentumsByHeight(10, 50);

    expect(sdkInstance.ledger.getMomentumsByHeight).toHaveBeenCalledWith(10, 50);
  });

  it('getMomentumByHash and getAccountBlockByHash wrap errors', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();

    sdkInstance.ledger.getMomentumByHash.mockRejectedValue(new Error('x'));
    await expect(zenonClient.getMomentumByHash('h')).rejects.toThrow(
      /Failed to fetch momentum by hash/,
    );

    sdkInstance.ledger.getAccountBlockByHash.mockRejectedValue(new Error('y'));
    await expect(zenonClient.getAccountBlockByHash('h')).rejects.toThrow(
      /Failed to fetch account block by hash/,
    );
  });

  it('subscribe/unsubscribe manages callback map and reuses one upstream stream', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();

    const stream = { onNotification: vi.fn() };
    sdkInstance.subscribe.toMomentums.mockResolvedValue(stream);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const id1 = await zenonClient.subscribeToMomentums(cb1);
    const id2 = await zenonClient.subscribeToMomentums(cb2);

    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
    expect(id1).not.toBe(id2);
    // toMomentums is invoked once and reused for all subscribers.
    expect(sdkInstance.subscribe.toMomentums).toHaveBeenCalledTimes(1);
    expect(stream.onNotification).toHaveBeenCalledTimes(1);

    expect(() => zenonClient.unsubscribeFromMomentums(id1)).not.toThrow();
    expect(() => zenonClient.unsubscribeFromMomentums(id2)).not.toThrow();
  });

  it('disconnect clears state and toggles isConnected', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();
    expect(zenonClient.isConnected()).toBe(true);

    sdkInstance.clearConnection.mockClear();
    await zenonClient.disconnect();
    expect(sdkInstance.clearConnection).toHaveBeenCalledTimes(1);
    expect(zenonClient.isConnected()).toBe(false);
  });

  it('getSDK returns the underlying instance', async () => {
    expect(zenonClient.getSDK()).toBe(sdkInstance);
  });

  it('fan-out: onNotification re-fetches momentum and invokes subscriber callback', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();

    const momentum = { height: 100, hash: 'h1' };
    sdkInstance.ledger.getMomentumByHash.mockResolvedValue(momentum);

    const stream = { onNotification: vi.fn() };
    sdkInstance.subscribe.toMomentums.mockResolvedValue(stream);

    const cb = vi.fn();
    await zenonClient.subscribeToMomentums(cb);

    // The onNotification handler uses `void` (fire-and-forget), so the
    // fan-out runs asynchronously in the background. We need to wait for it.
    const handler = stream.onNotification.mock.calls[0][0];
    handler([{ hash: 'h1' }]);

    // Wait for the async fan-out to complete
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledWith(momentum);
    });

    expect(sdkInstance.ledger.getMomentumByHash).toHaveBeenCalledWith('h1');
  });

  it('concurrent subscribes only call toMomentums once', async () => {
    sdkInstance.initialize.mockResolvedValue(undefined);
    await zenonClient.initialize();

    let resolveStream: (v: any) => void;
    const streamPromise = new Promise((r) => {
      resolveStream = r;
    });
    sdkInstance.subscribe.toMomentums.mockReturnValue(streamPromise);

    // Fire two subscribes concurrently before the stream resolves
    const p1 = zenonClient.subscribeToMomentums(vi.fn());
    const p2 = zenonClient.subscribeToMomentums(vi.fn());

    resolveStream!({ onNotification: vi.fn() });
    await Promise.all([p1, p2]);

    // Only one upstream subscription despite two subscribers
    expect(sdkInstance.subscribe.toMomentums).toHaveBeenCalledTimes(1);
  });
});

describe('node failover', () => {
  const anchor = { height: 50n, hash: 'h50' };

  beforeEach(async () => {
    zenonConfig.wsUrls = [PRIMARY, BACKUP];
    sdkInstance.initialize.mockResolvedValue(undefined);
    // The client reads the node list when it is constructed
    vi.resetModules();
    ({ zenonClient } = await import('../../src/services/zenon-client.js'));
  });

  function connectedUrls(): string[] {
    return sdkInstance.initialize.mock.calls.map((call: any[]) => call[0]);
  }

  it('connects to the primary when it is healthy', async () => {
    probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);

    expect(connectedUrls()).toEqual([PRIMARY]);
    expect(zenonClient.isOnBackup()).toBe(false);
    expect(probeNode).toHaveBeenCalledWith(PRIMARY, 50n, expect.any(Number));
  });

  it.each([
    ['is unreachable', new Error('connection failed')],
    ['is on another chain', { ...healthy(), chainId: 3 }],
    ['has not reached the indexed height', healthy(40n, null)],
    ['has a different momentum at the indexed height', healthy(100n, 'other')],
    ['trails the backup by more than the allowed lag', healthy(89n)],
  ])('uses the backup when the primary %s', async (_label, primary) => {
    probes({ [PRIMARY]: primary, [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);

    expect(connectedUrls()).toEqual([BACKUP]);
    expect(zenonClient.isOnBackup()).toBe(true);
    expect(zenonClient.activeUrl()).toBe(BACKUP);
  });

  it('keeps the primary when it trails the backup within the allowed lag', async () => {
    probes({ [PRIMARY]: healthy(90n), [BACKUP]: healthy(100n) });
    await zenonClient.initialize(anchor);
    expect(connectedUrls()).toEqual([PRIMARY]);
  });

  it('tries the next healthy node when connecting fails, and stops the failed connection', async () => {
    probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
    sdkInstance.initialize.mockRejectedValueOnce('Timeout after 30 seconds');
    await zenonClient.initialize(anchor);

    expect(connectedUrls()).toEqual([PRIMARY, BACKUP]);
    expect(zenonClient.activeUrl()).toBe(BACKUP);
    // Before each connect, plus once after the failed connect
    expect(sdkInstance.clearConnection).toHaveBeenCalledTimes(3);
  });

  it('initialize() throws when no node is healthy', async () => {
    probes({ [PRIMARY]: new Error('down'), [BACKUP]: new Error('down') });
    await expect(zenonClient.initialize(anchor)).rejects.toThrow(/no healthy node/);
    expect(sdkInstance.initialize).not.toHaveBeenCalled();
  });

  it('failover() reconnects to the best node and restores the momentum subscription', async () => {
    probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);
    const stream = { onNotification: vi.fn() };
    sdkInstance.subscribe.toMomentums.mockResolvedValue(stream);
    await zenonClient.subscribeToMomentums(vi.fn());

    probes({ [PRIMARY]: new Error('down'), [BACKUP]: healthy() });
    expect(await zenonClient.failover(anchor)).toBe(true);

    expect(connectedUrls()).toEqual([PRIMARY, BACKUP]);
    expect(sdkInstance.subscribe.toMomentums).toHaveBeenCalledTimes(2);
  });

  it('failover() returns false when no node is healthy', async () => {
    probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);

    probes({ [PRIMARY]: new Error('down'), [BACKUP]: new Error('down') });
    expect(await zenonClient.failover(anchor)).toBe(false);
  });

  it('failback() returns to the primary once it is healthy', async () => {
    probes({ [PRIMARY]: new Error('down'), [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);

    probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
    await zenonClient.failback(anchor);

    expect(connectedUrls()).toEqual([BACKUP, PRIMARY]);
    expect(zenonClient.isOnBackup()).toBe(false);
  });

  it('failback() stays on the backup while the primary is unhealthy', async () => {
    probes({ [PRIMARY]: new Error('down'), [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);

    probes({ [PRIMARY]: healthy(80n), [BACKUP]: healthy(100n) });
    await zenonClient.failback(anchor);

    expect(connectedUrls()).toEqual([BACKUP]);
  });

  it('failback() does nothing on the primary', async () => {
    probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
    await zenonClient.initialize(anchor);
    probeNode.mockClear();

    await zenonClient.failback(anchor);
    expect(probeNode).not.toHaveBeenCalled();
  });

  it('fails a call the node never answers', async () => {
    vi.useFakeTimers();
    try {
      probes({ [PRIMARY]: healthy(), [BACKUP]: healthy() });
      await zenonClient.initialize(anchor);
      sdkInstance.ledger.getFrontierMomentum.mockReturnValue(new Promise(() => {}));

      const call = zenonClient.getFrontierMomentum();
      const assertion = expect(call).rejects.toThrow(/no response within 60s/);
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
