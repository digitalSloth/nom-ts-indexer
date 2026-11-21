import { Zenon } from 'znn-typescript-sdk';
import type {
  Momentum,
  MomentumList,
  AccountBlock,
} from 'znn-typescript-sdk/dist/model/nom/index.js';
import { zenonConfig } from '../config/zenon.js';
import { probeNode, rankNodes, type ChainAnchor } from './node-probe.js';

const CONNECT_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 10_000;
// The SDK sets no call timeout, so a node that stops answering would hang
// a call forever. A timed-out call counts as a node failure.
const RPC_CALL_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no response within ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Zenon SDK Client Service
 * Wraps the znn-typescript-sdk to provide a clean interface for:
 * - RPC calls for historical data fetching
 * - WebSocket subscriptions for real-time momentum updates
 *
 * The SDK's `subscribe` API is only wired when the underlying client is a
 * `WsClient` (see `Zenon._setClient`). We initialize against a WebSocket URL
 * so a single connection serves both ledger RPC and the subscription stream —
 * `rpc-websockets` multiplexes concurrent calls under the hood.
 *
 * `ZNN_WS_URL` lists one or more nodes in priority order. The client
 * connects to the first healthy node, and `failover()` / `failback()` move
 * the connection between them (see `node-probe.ts` for the health rules).
 */
class ZenonClient {
  private zenon: Zenon;
  private isInitialized = false;
  private wsCallbacks: Map<string, (momentum: Momentum) => void> = new Map();
  private subscriptionInitialized = false;
  private subscriptionInitPromise?: Promise<void>;
  private readonly nodeUrls: string[] = zenonConfig.wsUrls;
  private activeIndex = -1;

  constructor() {
    this.zenon = Zenon.getInstance();

    // Set chain ID from config
    Zenon.setChainID(zenonConfig.chainId);
  }

  /**
   * Connect to the first healthy node. `anchor` is the last indexed
   * momentum, which a healthy node must have on its chain.
   */
  async initialize(anchor: ChainAnchor | null = null): Promise<void> {
    if (this.isInitialized) {
      console.log('Zenon client already initialized');
      return;
    }

    console.log(`Initializing Zenon client...`);
    console.log(`WS URLs: ${this.nodeUrls.join(', ')}`);
    console.log(`Chain ID: ${zenonConfig.chainId}`);

    if (!(await this.connectToBestNode(anchor))) {
      throw new Error('Zenon client initialization failed: no healthy node');
    }
    console.log('✓ Zenon client initialized successfully');
  }

  /**
   * Reconnect to the highest-priority healthy node, which may be the
   * current one. Returns false when no node is healthy.
   */
  async failover(anchor: ChainAnchor | null): Promise<boolean> {
    console.warn(`Failing over from ${this.activeUrl()}`);
    return this.connectToBestNode(anchor);
  }

  /**
   * While on a backup, switch to a higher-priority node once it is healthy.
   * Stays on the current node otherwise.
   */
  async failback(anchor: ChainAnchor | null): Promise<void> {
    if (!this.isOnBackup()) return;

    const { usable } = await this.checkNodes(anchor);
    const preferred = usable.find((i) => i < this.activeIndex);
    if (preferred === undefined) return;

    const from = this.activeUrl();
    if (await this.connectTo(preferred)) {
      console.log(`✓ Failed back from ${from} to ${this.activeUrl()}`);
    } else if (!(await this.connectToBestNode(anchor))) {
      // The old connection is closed, so stay connected to something
      console.error('No healthy node after a failed failback');
    }
  }

  /** True when connected to a node other than the primary. */
  isOnBackup(): boolean {
    return this.activeIndex > 0;
  }

  /** The URL of the connected node, or null before the first connection. */
  activeUrl(): string | null {
    return this.nodeUrls[this.activeIndex] ?? null;
  }

  private async checkNodes(anchor: ChainAnchor | null) {
    const results = await Promise.all(
      this.nodeUrls.map((url) =>
        probeNode(url, anchor?.height ?? null, PROBE_TIMEOUT_MS).catch((error: Error) => error),
      ),
    );
    return rankNodes(results, anchor, zenonConfig.chainId);
  }

  private async connectToBestNode(anchor: ChainAnchor | null): Promise<boolean> {
    const { usable, reasons } = await this.checkNodes(anchor);
    reasons.forEach((reason, i) => {
      if (reason) console.warn(`Skipping node ${this.nodeUrls[i]}: ${reason}`);
    });

    for (const index of usable) {
      if (await this.connectTo(index)) return true;
    }
    console.error('No healthy Zenon node');
    return false;
  }

  /**
   * Replace the current connection with one to `nodeUrls[index]`, and
   * restore the momentum subscription if one was open.
   */
  private async connectTo(index: number): Promise<boolean> {
    const url = this.nodeUrls[index];
    this.zenon.clearConnection();
    this.subscriptionInitialized = false;

    try {
      console.log(`Connecting to ${url}`);
      await this.zenon.initialize(url, CONNECT_TIMEOUT_MS);
    } catch (error) {
      // Stop the SDK's reconnect loop to the failed node
      this.zenon.clearConnection();
      this.isInitialized = false;
      console.error(`Failed to connect to ${url}:`, error);
      return false;
    }

    this.activeIndex = index;
    this.isInitialized = true;
    console.log(`✓ Connected to ${url}`);

    if (this.wsCallbacks.size > 0) {
      try {
        await this.ensureMomentumStream();
      } catch (error) {
        // The indexer's frontier poll still finds new momentums
        console.error(`Failed to resubscribe to momentums on ${url}:`, error);
      }
    }
    return true;
  }

  /**
   * Ensure client is initialized before making calls
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Zenon client not initialized. Call initialize() first.');
    }
  }

  /**
   * Get the latest momentum from the network
   */
  async getFrontierMomentum(): Promise<Momentum> {
    this.ensureInitialized();

    try {
      return await withTimeout(this.zenon.ledger.getFrontierMomentum(), RPC_CALL_TIMEOUT_MS);
    } catch (error) {
      console.error('Error fetching frontier momentum:', error);
      throw new Error(`Failed to fetch frontier momentum: ${error}`);
    }
  }

  /**
   * Get momentums by height in batch
   * @param height Starting height
   * @param count Number of momentums to fetch (max based on RPC_MAX_PAGE_SIZE)
   */
  async getMomentumsByHeight(height: number, count: number = 100): Promise<MomentumList> {
    this.ensureInitialized();

    try {
      return await withTimeout(
        this.zenon.ledger.getMomentumsByHeight(height, count),
        RPC_CALL_TIMEOUT_MS,
      );
    } catch (error) {
      console.error(`Error fetching momentums at height ${height}:`, error);
      throw new Error(`Failed to fetch momentums at height ${height}: ${error}`);
    }
  }

  /**
   * Get momentum by hash
   */
  async getMomentumByHash(hash: any): Promise<Momentum | null> {
    this.ensureInitialized();

    try {
      return await withTimeout(this.zenon.ledger.getMomentumByHash(hash), RPC_CALL_TIMEOUT_MS);
    } catch (error) {
      console.error(`Error fetching momentum by hash ${hash}:`, error);
      throw new Error(`Failed to fetch momentum by hash: ${error}`);
    }
  }

  /**
   * Get account block by hash
   */
  async getAccountBlockByHash(hash: any): Promise<AccountBlock | null> {
    this.ensureInitialized();

    try {
      return await withTimeout(this.zenon.ledger.getAccountBlockByHash(hash), RPC_CALL_TIMEOUT_MS);
    } catch (error) {
      console.error(`Error fetching account block by hash ${hash}:`, error);
      throw new Error(`Failed to fetch account block by hash: ${error}`);
    }
  }

  /**
   * Subscribe to new momentums via WebSocket. Multiple callers share a single
   * upstream stream — `toMomentums()` is invoked once and incoming
   * notifications are fanned out to every registered callback.
   *
   * znnd notifications arrive as an array of partial momentum updates (hash +
   * height). The indexer expects fully-populated `Momentum` objects, so each
   * notification triggers a `getMomentumByHash` re-fetch before fan-out.
   */
  async subscribeToMomentums(callback: (momentum: Momentum) => void): Promise<string> {
    this.ensureInitialized();

    const subscriptionId = `momentum-${Date.now()}-${Math.random()}`;
    this.wsCallbacks.set(subscriptionId, callback);

    try {
      await this.ensureMomentumStream();
      console.log(`✓ Subscribed to momentum updates (id=${subscriptionId})`);
      return subscriptionId;
    } catch (error) {
      console.error('Error subscribing to momentums:', error);
      this.wsCallbacks.delete(subscriptionId);
      throw new Error(`Failed to subscribe to momentums: ${error}`);
    }
  }

  private async ensureMomentumStream(): Promise<void> {
    if (this.subscriptionInitialized) return;
    if (this.subscriptionInitPromise) return this.subscriptionInitPromise;

    this.subscriptionInitPromise = (async () => {
      console.log(`Subscribing to momentums via WebSocket: ${this.activeUrl()}`);
      const stream = await withTimeout(this.zenon.subscribe.toMomentums(), RPC_CALL_TIMEOUT_MS);
      stream.onNotification((data: any[]) => {
        void this.fanOutMomentumNotifications(data);
      });
      this.subscriptionInitialized = true;
    })();

    try {
      await this.subscriptionInitPromise;
    } finally {
      this.subscriptionInitPromise = undefined;
    }
  }

  private async fanOutMomentumNotifications(data: any[]): Promise<void> {
    if (!Array.isArray(data) || data.length === 0) return;

    for (const entry of data) {
      const hash = entry?.hash;
      if (!hash) continue;

      try {
        const momentum = await this.getMomentumByHash(hash);
        if (!momentum) continue;
        for (const cb of this.wsCallbacks.values()) {
          try {
            cb(momentum);
          } catch (err) {
            console.error('Error in momentum subscriber callback:', err);
          }
        }
      } catch (err) {
        console.error(`Failed to resolve momentum ${hash} from WS notification:`, err);
      }
    }
  }

  /**
   * Unsubscribe from momentum updates. The underlying SDK stream stays open
   * because the WS API has no clean unsubscribe; the SIGINT/SIGTERM handler in
   * `IndexerService.stop()` is what tears the connection down via
   * `disconnect()`.
   */
  unsubscribeFromMomentums(subscriptionId: string): void {
    this.wsCallbacks.delete(subscriptionId);
  }

  /**
   * Clear all connections and cleanup
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting Zenon client...');

    try {
      this.wsCallbacks.clear();
      this.subscriptionInitialized = false;
      this.zenon.clearConnection();
      this.isInitialized = false;
      this.activeIndex = -1;
      console.log('✓ Zenon client disconnected');
    } catch (error) {
      console.error('Error disconnecting Zenon client:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the underlying Zenon SDK instance (for advanced usage)
   */
  getSDK(): Zenon {
    return this.zenon;
  }
}

// Export singleton instance
export const zenonClient = new ZenonClient();
export type { Momentum, MomentumList, AccountBlock };
