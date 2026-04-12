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

let zenonClient: typeof import('../../src/services/zenon-client.js').zenonClient;

beforeEach(async () => {
  vi.resetModules();
  Object.values(sdkInstance.ledger).forEach((m: any) => m.mockReset());
  sdkInstance.initialize.mockReset();
  sdkInstance.subscribe.toMomentums.mockReset();
  sdkInstance.clearConnection.mockReset();
  ZenonMock.getInstance.mockClear();
  ZenonMock.setChainID.mockClear();
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
    await expect(zenonClient.getMomentumByHash('h')).rejects.toThrow(/Failed to fetch momentum by hash/);

    sdkInstance.ledger.getAccountBlockByHash.mockRejectedValue(new Error('y'));
    await expect(zenonClient.getAccountBlockByHash('h')).rejects.toThrow(/Failed to fetch account block by hash/);
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
    const streamPromise = new Promise((r) => { resolveStream = r; });
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
