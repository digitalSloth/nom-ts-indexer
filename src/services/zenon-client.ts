import { Zenon } from 'znn-typescript-sdk';
import type {
  Momentum,
  MomentumList,
  AccountBlock,
} from 'znn-typescript-sdk/dist/model/nom/index.js';
import { zenonConfig } from '../config/zenon.js';

/**
 * Zenon SDK Client Service
 * Wraps the znn-typescript-sdk to provide a clean interface for:
 * - RPC calls for historical data fetching
 * - WebSocket subscriptions for real-time momentum updates
 *
 * The SDK's `subscribe` API is only wired when the underlying client is a
 * `WsClient` (see `Zenon._setClient`). We initialize against `wsUrl` so a
 * single connection serves both ledger RPC and the subscription stream —
 * `rpc-websockets` multiplexes concurrent calls under the hood.
 */
class ZenonClient {
  private zenon: Zenon;
  private isInitialized = false;
  private wsCallbacks: Map<string, (momentum: Momentum) => void> = new Map();
  private subscriptionInitialized = false;
  private subscriptionInitPromise?: Promise<void>;

  constructor() {
    this.zenon = Zenon.getInstance();

    // Set chain ID from config
    Zenon.setChainID(zenonConfig.chainId);
  }

  /**
   * Initialize the connection. Uses the WebSocket URL so that both ledger RPC
   * and subscription notifications flow through the same client.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Zenon client already initialized');
      return;
    }

    console.log(`Initializing Zenon client...`);
    console.log(`WS URL: ${zenonConfig.wsUrl}`);
    console.log(`Chain ID: ${zenonConfig.chainId}`);

    try {
      await this.zenon.initialize(zenonConfig.wsUrl, 30000);
      this.isInitialized = true;
      console.log('✓ Zenon client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Zenon client:', error);
      throw new Error(`Zenon client initialization failed: ${error}`);
    }
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
      return await this.zenon.ledger.getFrontierMomentum();
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
      return await this.zenon.ledger.getMomentumsByHeight(height, count);
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
      return await this.zenon.ledger.getMomentumByHash(hash);
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
      return await this.zenon.ledger.getAccountBlockByHash(hash);
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
      console.log(`Subscribing to momentums via WebSocket: ${zenonConfig.wsUrl}`);
      const stream = await this.zenon.subscribe.toMomentums();
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
