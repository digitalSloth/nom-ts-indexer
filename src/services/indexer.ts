import { zenonClient } from './zenon-client.js';
import { databaseService } from './database.js';
import { insertMomentum, insertAccountBlock } from '../actions/indexer/index.js';
import { zenonConfig } from '../config/zenon.js';
import { mapWithConcurrency } from '../helpers/concurrency.js';
import { partitionManager } from '../database/partition-manager.js';
import { cacheService } from './cache.js';
import {
  contractRegistry,
  pillarRegistry,
  accountRegistry,
  tokenRegistry,
} from './registries/index.js';
import { webhookDispatcher } from '../webhooks/index.js';
import { pluginRegistry } from './plugin-registry.js';
import type { Momentum, AccountBlock } from 'znn-typescript-sdk';
import { IndexedAccountBlockEvent, IndexedMomentumEvent } from '../plugins';

const RPC_FETCH_CONCURRENCY = 32;

/**
 * Main Indexer Service. Two modes:
 *  - **Historical**: pulls momentums in batches, fans out account-block fetches
 *    in parallel, then processes each momentum in its own transaction.
 *  - **Real-time** (WebSocket): one momentum at a time, single-momentum
 *    transaction. Latency-critical path.
 *
 * Both paths use the same `processOneMomentum` method.
 */
class IndexerService {
  private isRunning = false;
  private currentDbHeight: bigint = BigInt(0);
  private wsSubscriptionId?: string;
  private processingDone: (() => void) | null = null;
  private processingPromise: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Indexer is already running');
      return;
    }

    console.log('🚀 Starting Zenon Network Indexer...\n');

    try {
      await zenonClient.initialize();

      const lock = await this.obtainLock();
      if (!lock) {
        console.log('Could not obtain indexer lock. Another instance may be running.');
        return;
      }

      this.isRunning = true;
      await databaseService.updateIndexerState({ is_running: true });

      console.log('🔍 Checking table partitioning status...\n');
      await partitionManager.checkAndPartition();

      // Preload registries: contract methods, pillar producers. Account/token
      // registries warm up on demand as we encounter addresses/tokens.
      await contractRegistry.load();
      await pillarRegistry.load();
      await pluginRegistry.load();

      await this.setCurrentHeight();

      await pluginRegistry.catchUp(this.currentDbHeight);

      const frontierMomentum = await this.loadFrontierMomentum();
      if (!frontierMomentum) {
        return;
      }

      // Index up to the 2nd latest momentum (lets the network reject any
      // invalid frontier without us having to roll back).
      const targetHeight = Number(frontierMomentum.height) - 1;
      const momentumsToIndex = targetHeight - Number(this.currentDbHeight);

      console.log('Indexer Configuration:');
      console.log(`  Start height: ${this.currentDbHeight}`);
      console.log(`  Target height: ${targetHeight}`);
      console.log(`  Momentums to index: ${momentumsToIndex}`);
      console.log(`  Batch size: ${zenonConfig.batchSize}\n`);

      if (momentumsToIndex > 0) {
        console.log('📦 Starting historical indexing...\n');
        await this.indexHistoricalMomentums(targetHeight);
      } else {
        console.log('✓ Database is up to date!\n');
      }

      if (zenonConfig.exitAfterSync) {
        console.log('✓ Historical sync complete, exiting (EXIT_AFTER_SYNC=true)\n');
        await this.stop();
        return;
      }

      console.log('🔄 Switching to real-time sync via WebSocket...\n');
      await this.startRealtimeSync();

      console.log('✓ Indexer is now running in real-time mode\n');
    } catch (error) {
      console.error('Error starting indexer:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping indexer...');

    try {
      if (this.wsSubscriptionId) {
        zenonClient.unsubscribeFromMomentums(this.wsSubscriptionId);
      }

      this.isRunning = false;

      // Wait for any in-flight batch to finish before tearing down
      if (this.processingPromise) {
        console.log('  Waiting for current batch to finish...');
        await this.processingPromise;
        this.processingPromise = null;
      }

      await databaseService.updateIndexerState({ is_running: false });

      await pluginRegistry.shutdown();
      await this.releaseLock();

      console.log('✓ Indexer stopped');
    } catch (error) {
      console.error('Error stopping indexer:', error);
      throw error;
    }
  }

  async pause(): Promise<void> {
    await cacheService.getClient().set('indexer:emergency_lock', '1');
    console.log('⏸️  Indexer paused (emergency lock activated)');
  }

  async resume(): Promise<void> {
    await cacheService.getClient().del('indexer:emergency_lock', 'indexer:lock');
    console.log('▶️  Indexer locks cleared (ready to resume)');
  }

  private async setCurrentHeight(): Promise<void> {
    this.currentDbHeight = await databaseService.getCurrentHeight();
    console.log(`Current database height: ${this.currentDbHeight}`);
  }

  private async loadFrontierMomentum(): Promise<Momentum | null> {
    try {
      const momentum = await zenonClient.getFrontierMomentum();
      console.log(`Frontier momentum: height=${momentum.height}, hash=${momentum.hash}\n`);
      return momentum;
    } catch (error) {
      console.error('Unable to load frontier momentum:', error);
      return null;
    }
  }

  private async obtainLock(): Promise<boolean> {
    const emergencyLock = await cacheService.getClient().get('indexer:emergency_lock');
    if (emergencyLock) {
      console.log('Emergency lock active, operation aborted.');
      return false;
    }

    const regularLock = await cacheService.getClient().set('indexer:lock', '1', 'EX', 30, 'NX');
    if (!regularLock) {
      console.log('Regular lock active, another process is running.');
      return false;
    }

    this.extendLockPeriodically();
    return true;
  }

  private async releaseLock(): Promise<void> {
    await cacheService.getClient().del('indexer:lock');
  }

  private extendLockPeriodically(): void {
    const interval = setInterval(async () => {
      if (this.isRunning) {
        await cacheService.getClient().expire('indexer:lock', 30);
      } else {
        clearInterval(interval);
      }
    }, 20000);
  }

  private async indexHistoricalMomentums(targetHeight: number): Promise<void> {
    // Track processing so stop() can wait for it to finish
    this.processingPromise = new Promise<void>((resolve) => {
      this.processingDone = resolve;
    });

    let processed = 0;
    const total = targetHeight - Number(this.currentDbHeight);
    const startTime = Date.now();

    try {
      while (Number(this.currentDbHeight) < targetHeight && this.isRunning) {
        try {
          const batchSize = Math.min(
            zenonConfig.batchSize,
            targetHeight - Number(this.currentDbHeight),
          );

          const indexed = await this.processBatch(
            Number(this.currentDbHeight) + 1,
            batchSize,
            targetHeight,
          );
          if (indexed === 0) break;

          processed += indexed;
          const progress = ((processed / total) * 100).toFixed(2);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (processed / (Date.now() - startTime)) * 1000;

          console.log(
            `Progress: ${processed}/${total} (${progress}%) | ${rate.toFixed(1)} m/s | ${elapsed}s elapsed`,
          );

          if (processed % 100000 === 0) {
            await partitionManager.checkAndPartition();
          }
        } catch (error) {
          console.error('Error processing batch:', error);
          console.log('Stopping indexer due to error');
          await this.stop();
          throw error;
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✓ Historical indexing complete in ${totalTime}s\n`);
    } finally {
      this.processingDone?.();
      this.processingDone = null;
    }
  }

  /**
   * Historical-mode batch path. Fetches a batch of momentums + all their
   * account blocks in parallel (the real speedup), then processes each
   * momentum in its own transaction.
   *
   * Returns the number of momentums processed.
   */
  private async processBatch(
    startHeight: number,
    count: number,
    targetHeight: number,
  ): Promise<number> {
    const momentumList = await zenonClient.getMomentumsByHeight(startHeight, count);
    if (!momentumList.list || momentumList.list.length === 0) {
      console.warn('No momentums returned in batch');
      return 0;
    }

    const momentums = momentumList.list.filter((m) => Number(m.height) <= targetHeight);
    if (momentums.length === 0) return 0;

    const blocksByMomentumHash = await this.fetchAccountBlocksForBatch(momentums);

    for (const momentum of momentums) {
      const blocks = blocksByMomentumHash.get(momentum.hash.toString()) ?? [];
      await this.processOneMomentum(momentum, blocks);
    }

    const last = momentums[momentums.length - 1];
    this.currentDbHeight = BigInt(last.height);
    await databaseService.updateIndexerState({
      last_indexed_momentum: this.currentDbHeight,
    });

    return momentums.length;
  }

  /**
   * Fetch account blocks for every momentum in the batch in parallel, capped
   * at RPC_FETCH_CONCURRENCY total in-flight requests so genesis doesn't
   * hammer the RPC node. Returns a Map keyed by momentum hash.
   */
  private async fetchAccountBlocksForBatch(
    momentums: Momentum[],
  ): Promise<Map<string, AccountBlock[]>> {
    const tasks: Array<{ momentumHash: string; contentHash: any }> = [];
    for (const m of momentums) {
      if (!m.content) continue;
      const momentumHash = m.hash.toString();
      for (const c of m.content) {
        tasks.push({ momentumHash, contentHash: c.hash });
      }
    }

    const fetched = await mapWithConcurrency(tasks, RPC_FETCH_CONCURRENCY, async (t) => {
      const block = await zenonClient.getAccountBlockByHash(t.contentHash);
      if (!block) console.warn(`Could not fetch account block: ${t.contentHash}`);
      return { momentumHash: t.momentumHash, block };
    });

    const out = new Map<string, AccountBlock[]>();
    for (const m of momentums) out.set(m.hash.toString(), []);
    for (const f of fetched) {
      if (f.block) out.get(f.momentumHash)!.push(f.block);
    }
    return out;
  }

  /**
   * Process a single momentum: insert into DB, fire webhooks, dispatch to
   * plugins. Used by both the historical batch path and the real-time path.
   */
  private async processOneMomentum(momentum: Momentum, blocks: AccountBlock[]): Promise<void> {
    const knex = databaseService.getDb();
    let momentumEvent!: IndexedMomentumEvent;
    const accountBlockEvents: IndexedAccountBlockEvent[] = [];

    await knex.transaction(async (tx) => {
      momentumEvent = await insertMomentum(tx, momentum);
      for (const ab of blocks) {
        const event = await insertAccountBlock(tx, ab, momentumEvent);
        if (event) accountBlockEvents.push(event);
      }
    });

    webhookDispatcher.dispatch('momentum.inserted', {
      height: momentum.height.toString(),
      hash: momentum.hash.toString(),
      timestamp: momentum.timestamp,
    });
    for (const ab of blocks) {
      webhookDispatcher.dispatch('account_block.inserted', {
        momentumHeight: momentum.height.toString(),
        hash: ab.hash.toString(),
        address: ab.address.toString(),
        toAddress: ab.toAddress.toString(),
        blockType: ab.blockType,
      });
    }

    await this.dispatchPluginsForMomentum(momentumEvent, accountBlockEvents);
  }

  /**
   * Real-time path. Fetches blocks for a single momentum then delegates to
   * processOneMomentum.
   */
  private async processSingleMomentum(momentum: Momentum): Promise<void> {
    let accountBlocks: AccountBlock[] = [];
    if (momentum.content && momentum.content.length > 0) {
      const fetched = await mapWithConcurrency(
        momentum.content,
        RPC_FETCH_CONCURRENCY,
        async (content) => {
          const block = await zenonClient.getAccountBlockByHash(content.hash);
          if (!block) console.warn(`Could not fetch account block: ${content.hash}`);
          return block;
        },
      );
      accountBlocks = fetched.filter((b): b is AccountBlock => b !== null);
    }

    await this.processOneMomentum(momentum, accountBlocks);
  }

  private async startRealtimeSync(): Promise<void> {
    this.wsSubscriptionId = await zenonClient.subscribeToMomentums(async (momentum: Momentum) => {
      try {
        if (BigInt(momentum.height) > this.currentDbHeight) {
          console.log(`\n📨 New momentum received: height=${momentum.height}`);
          await this.processSingleMomentum(momentum);
          this.currentDbHeight = BigInt(momentum.height);

          await databaseService.updateIndexerState({
            last_indexed_momentum: this.currentDbHeight,
          });

          const stats = await databaseService.getStats();
          console.log(
            `  Stats: ${stats.momentums} momentums, ${stats.accountBlocks} blocks, ${stats.accounts} accounts | account cache: ${accountRegistry.size()}`,
          );
        }
      } catch (error) {
        console.error('Error processing real-time momentum:', error);
        // Don't stop indexer on single momentum error in real-time mode
      }
    });
  }

  /**
   * Dispatch pre-built events to plugins.
   * Called after the core transaction commits — failures are isolated per plugin.
   */
  private async dispatchPluginsForMomentum(
    momentumEvent: IndexedMomentumEvent,
    accountBlockEvents: IndexedAccountBlockEvent[],
  ): Promise<void> {
    await pluginRegistry.dispatchMomentum(momentumEvent);
    for (const event of accountBlockEvents) {
      await pluginRegistry.dispatchAccountBlock(event);
    }
  }

  isIndexerRunning(): boolean {
    return this.isRunning;
  }

  async getStatus() {
    const state = await databaseService.getIndexerState();
    const stats = await databaseService.getStats();

    return {
      isRunning: this.isRunning,
      currentHeight: this.currentDbHeight,
      lastIndexedMomentum: state.last_indexed_momentum,
      stats,
      cache: {
        accounts: accountRegistry.size(),
      },
    };
  }
}

// Export singleton instance
export const indexerService = new IndexerService();

// Re-export for callers/tests that import via this module.
export { tokenRegistry, pillarRegistry, accountRegistry };
