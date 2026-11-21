import { zenonClient } from './zenon-client.js';
import { databaseService } from './database.js';
import { insertMomentum, insertAccountBlock } from '../actions/indexer/index.js';
import { zenonConfig } from '../config/zenon.js';
import { mapWithConcurrency } from '../helpers/concurrency.js';
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
import type { ChainAnchor } from './node-probe.js';
import { syncContractMethods } from '../database/contract-methods.js';
import { seedState } from '../database/seeders/seed-state.js';
import { refreshPillarRanks } from '../actions/indexer/pillar-metrics.js';
import { ZNN_TOKEN_STANDARD } from '../constants/zenon.js';

const RPC_FETCH_CONCURRENCY = 32;
const FRONTIER_POLL_MS = 30_000;
const RETRY_INITIAL_MS = 1_000;
const RETRY_MAX_MS = 60_000;
// Consecutive failed batches or frontier polls before switching node
const FAILOVER_AFTER_FAILURES = 3;
const FAILBACK_CHECK_MS = 5 * 60_000;
// How often the pause and restart keys are read from Redis
const CONTROL_POLL_MS = 2_000;

/**
 * Main Indexer Service. Two modes:
 *  - **Historical**: pulls momentums in batches, fans out account-block fetches
 *    in parallel, then processes each momentum in its own transaction.
 *  - **Real-time**: WebSocket notifications and a frontier poll raise the
 *    target height. One worker indexes every height up to it, in order,
 *    and retries a failed height until it succeeds.
 *
 * Both paths use the same `processBatch` method, retry a failed batch with
 * backoff, and switch node after FAILOVER_AFTER_FAILURES failures in a row.
 * Node switches run between batches (see `runNodeCheck`).
 *
 * Two Redis keys control a running process, read every CONTROL_POLL_MS:
 *  - `emergency_lock` pauses indexing. Both loops wait before the next batch
 *    and resume when the key is deleted. The instance lock stays held, and
 *    a pause never counts as a stall.
 *  - `restart` is consumed once. The process then shuts down as on SIGTERM,
 *    finishing the momentum in flight, so its supervisor starts it again.
 */
class IndexerService {
  private isRunning = false;
  private currentDbHeight: bigint = BigInt(0);
  private wsSubscriptionId?: string;
  private processingDone: (() => void) | null = null;
  private processingPromise: Promise<void> | null = null;

  // Real-time worker state
  private realtimeTarget = 0n;
  private realtimeWorker: Promise<void> | null = null;
  private wakeWorker: (() => void) | null = null;
  private cancelRetryWait: (() => void) | null = null;
  private frontierPollTimer?: NodeJS.Timeout;
  private stallTimer?: NodeJS.Timeout;
  private lastProgressAt = 0;

  // Control and status state
  private paused = false;
  private pauseWaiter: (() => void) | null = null;
  private controlTimer?: NodeJS.Timeout;
  private restartRequested = false;
  private stopping = false;
  private stalled = false;
  private phase: 'historical' | 'realtime' = 'historical';
  private frontierHeight = 0n;
  private lastCommitAt: number | null = null;
  private lastError: { message: string; at: number } | null = null;

  // Node failover state
  private nodeFailures = 0;
  private nodeCheckDue: 'failover' | 'failback' | null = null;
  private failbackTimer?: NodeJS.Timeout;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Indexer is already running');
      return;
    }

    console.log('🚀 Starting Zenon Network Indexer...\n');
    this.stopping = false;

    try {
      // The height is read first so a paused process still reports it. A
      // paused process opens no node connection and takes no lock until
      // the pause clears.
      await this.setCurrentHeight();
      this.startControlPoll();
      await this.pollControl();
      await this.waitWhilePaused();
      if (this.stopping) return;

      await zenonClient.initialize(await this.loadAnchor());

      // A lock held by another instance is an error, so the process exits
      // and its supervisor retries later.
      const lock = await this.obtainLock();
      if (lock === 'held') {
        throw new Error('Could not obtain indexer lock. Another instance may be running.');
      }

      this.isRunning = true;
      await databaseService.updateIndexerState({ is_running: true });

      // A seeded database gets the contract methods a newer SDK adds before
      // the registry reads them. db:seed adds them to an empty one.
      const db = databaseService.getDb();
      if ((await seedState(db)) === 'seeded') {
        const added = await syncContractMethods(db);
        if (added > 0) console.log(`✓ ${added} new contract methods added`);
        // Pillar weights follow ZNN balance changes by token id, so the ZNN
        // id is cached before the first block.
        await tokenRegistry.getOrLoad(db, ZNN_TOKEN_STANDARD);
      }

      // Preload registries: contract methods, pillar producers. Account/token
      // registries warm up on demand as we encounter addresses/tokens.
      await contractRegistry.load();
      await pillarRegistry.load();
      await pluginRegistry.load();

      await pluginRegistry.catchUp(this.currentDbHeight);

      const frontierMomentum = await this.loadFrontierMomentum();
      if (!frontierMomentum) {
        throw new Error('Unable to load frontier momentum');
      }

      // Index up to the frontier, as the real-time worker does
      const targetHeight = Number(frontierMomentum.height);
      this.frontierHeight = BigInt(targetHeight);
      const momentumsToIndex = targetHeight - Number(this.currentDbHeight);

      console.log('Indexer Configuration:');
      console.log(`  Start height: ${this.currentDbHeight}`);
      console.log(`  Target height: ${targetHeight}`);
      console.log(`  Momentums to index: ${momentumsToIndex}`);
      console.log(`  Batch size: ${zenonConfig.batchSize}\n`);

      // While on a backup node, check the primary periodically
      this.failbackTimer = setInterval(() => {
        if (zenonClient.isOnBackup()) this.requestNodeCheck('failback');
      }, FAILBACK_CHECK_MS);

      if (momentumsToIndex > 0) {
        console.log('📦 Starting historical indexing...\n');
        await this.indexHistoricalMomentums(targetHeight);
        if (!this.isRunning) return;
      } else {
        console.log('✓ Database is up to date!\n');
      }

      if (zenonConfig.exitAfterSync) {
        console.log('✓ Historical sync complete, exiting (EXIT_AFTER_SYNC=true)\n');
        await this.stop();
        return;
      }

      console.log('🔄 Switching to real-time sync via WebSocket...\n');
      await this.startRealtimeSync(BigInt(targetHeight));

      console.log('✓ Indexer is now running in real-time mode\n');
    } catch (error) {
      console.error('Error starting indexer:', error);
      this.recordError(error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.controlTimer);
    this.releasePauseWait();

    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping indexer...');

    try {
      if (this.wsSubscriptionId) {
        zenonClient.unsubscribeFromMomentums(this.wsSubscriptionId);
      }

      this.isRunning = false;
      clearInterval(this.frontierPollTimer);
      clearInterval(this.stallTimer);
      clearInterval(this.failbackTimer);

      // Wait for any in-flight batch to finish before tearing down
      if (this.processingPromise) {
        this.cancelRetryWait?.();
        console.log('  Waiting for current batch to finish...');
        await this.processingPromise;
        this.processingPromise = null;
      }

      if (this.realtimeWorker) {
        console.log('  Waiting for current momentum to finish...');
        this.wakeWorker?.();
        this.cancelRetryWait?.();
        await this.realtimeWorker;
        this.realtimeWorker = null;
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
    await cacheService.getClient().set('emergency_lock', '1');
    console.log('⏸️  Indexer paused (emergency lock activated)');
  }

  async resume(): Promise<void> {
    await cacheService.getClient().del('emergency_lock');
    console.log('▶️  Emergency lock cleared (ready to resume)');
  }

  private startControlPoll(): void {
    clearInterval(this.controlTimer);
    this.controlTimer = setInterval(() => {
      void this.pollControl();
    }, CONTROL_POLL_MS);
  }

  private async pollControl(): Promise<void> {
    try {
      const redis = cacheService.getClient();
      const [emergencyLock, restart] = await Promise.all([
        redis.get('emergency_lock'),
        redis.getdel('restart'),
      ]);
      this.setPaused(Boolean(emergencyLock));
      if (restart) this.requestRestart();
    } catch (error) {
      console.error('Control poll failed:', error);
    }
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      console.log('⏸️  Emergency lock active, indexing pauses after the current batch.');
    } else {
      console.log('▶️  Emergency lock cleared, indexing resumes.');
      this.releasePauseWait();
    }
  }

  private requestRestart(): void {
    if (this.restartRequested) return;
    this.restartRequested = true;
    clearInterval(this.controlTimer);
    console.log('Restart requested, shutting down.');
    process.kill(process.pid, 'SIGTERM');
  }

  private releasePauseWait(): void {
    this.pauseWaiter?.();
    this.pauseWaiter = null;
  }

  /** Resolves at once unless paused, otherwise when the pause clears or stop() runs. */
  private async waitWhilePaused(): Promise<void> {
    if (!this.paused) return;
    await new Promise<void>((resolve) => {
      this.pauseWaiter = resolve;
    });
  }

  private recordError(error: unknown): void {
    this.lastError = {
      message: error instanceof Error ? error.message : String(error),
      at: Date.now(),
    };
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

  private async obtainLock(): Promise<'acquired' | 'held'> {
    const regularLock = await cacheService.getClient().set('lock', '1', 'EX', 30, 'NX');
    if (!regularLock) {
      console.log('Regular lock active, another process is running.');
      return 'held';
    }

    this.extendLockPeriodically();
    return 'acquired';
  }

  private async releaseLock(): Promise<void> {
    await cacheService.getClient().del('lock');
  }

  private extendLockPeriodically(): void {
    const interval = setInterval(async () => {
      if (this.isRunning) {
        await cacheService.getClient().expire('lock', 30);
      } else {
        clearInterval(interval);
      }
    }, 20000);
  }

  private async indexHistoricalMomentums(targetHeight: number): Promise<void> {
    this.phase = 'historical';
    // Track processing so stop() can wait for it to finish
    this.processingPromise = new Promise<void>((resolve) => {
      this.processingDone = resolve;
    });

    let processed = 0;
    const total = targetHeight - Number(this.currentDbHeight);
    const startTime = Date.now();
    let retryMs = RETRY_INITIAL_MS;

    try {
      while (Number(this.currentDbHeight) < targetHeight && this.isRunning) {
        await this.runNodeCheck();
        if (this.paused) await this.waitWhilePaused();
        if (!this.isRunning) break;

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
          this.nodeFailures = 0;
          retryMs = RETRY_INITIAL_MS;

          processed += indexed;
          const progress = ((processed / total) * 100).toFixed(2);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (processed / (Date.now() - startTime)) * 1000;

          console.log(
            `Progress: ${processed}/${total} (${progress}%) | ${rate.toFixed(1)} m/s | ${elapsed}s elapsed`,
          );
        } catch (error) {
          console.error(
            `Failed to index from height ${this.currentDbHeight + 1n}, retrying in ${retryMs / 1000}s:`,
            error,
          );
          this.recordError(error);
          this.noteNodeFailure();
          // A due node switch runs at once instead of after the backoff
          if (!this.nodeCheckDue) await this.waitForRetry(retryMs);
          retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
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

    let indexed = 0;
    for (const momentum of momentums) {
      const blocks = blocksByMomentumHash.get(momentum.hash.toString()) ?? [];
      await this.processOneMomentum(momentum, blocks);
      // Advance per momentum so a retry after a failure starts at the
      // failed height, not the start of the batch.
      this.currentDbHeight = BigInt(momentum.height);
      this.lastProgressAt = Date.now();
      this.lastCommitAt = this.lastProgressAt;
      this.stalled = false;
      indexed++;
      // A shutdown request ends the batch after the momentum in flight
      if (this.stopping) break;
    }

    return indexed;
  }

  /**
   * Fetch account blocks for every momentum in the batch in parallel, capped
   * at RPC_FETCH_CONCURRENCY total in-flight requests so genesis doesn't
   * hammer the RPC node. Returns a Map keyed by momentum hash. Throws if any
   * block is missing, so its momentum is never committed without it.
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
      if (!block) {
        throw new Error(`Account block ${t.contentHash} not found for momentum ${t.momentumHash}`);
      }
      return { momentumHash: t.momentumHash, block };
    });

    const out = new Map<string, AccountBlock[]>();
    for (const m of momentums) out.set(m.hash.toString(), []);
    for (const f of fetched) {
      out.get(f.momentumHash)!.push(f.block);
    }
    return out;
  }

  /**
   * Process a single momentum: insert into DB, fire webhooks, dispatch to
   * plugins. Used by both the historical batch path and the real-time path.
   *
   * The momentum's transaction also stores it as the last indexed height.
   * After a crash before plugin dispatch, the restart starts above this
   * momentum and plugin catch-up replays its blocks from the database.
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
      await refreshPillarRanks(tx);
      await databaseService.setLastIndexedMomentum(tx, BigInt(momentum.height));
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

    // After the core commit: a plugin failure never rolls back core rows
    await pluginRegistry.dispatchMomentum(momentumEvent, accountBlockEvents);
  }

  /**
   * Real-time path. WebSocket notifications and a frontier poll only raise
   * the target height; one worker does all indexing, so momentums are
   * processed in order and never concurrently.
   */
  private async startRealtimeSync(knownHeight: bigint): Promise<void> {
    this.phase = 'realtime';
    this.realtimeTarget = knownHeight;
    if (knownHeight > this.frontierHeight) this.frontierHeight = knownHeight;
    this.lastProgressAt = Date.now();

    this.wsSubscriptionId = await zenonClient.subscribeToMomentums((momentum: Momentum) => {
      this.raiseRealtimeTarget(BigInt(momentum.height));
    });

    // The SDK does not resubscribe after a reconnect, so poll the frontier
    // as well. Both feed the same worker.
    this.frontierPollTimer = setInterval(() => {
      void this.pollFrontier();
    }, FRONTIER_POLL_MS);

    // When nothing is indexed for too long, reconnect to the healthiest node.
    this.stallTimer = setInterval(() => {
      this.checkStalled();
    }, 1_000);

    this.realtimeWorker = this.runRealtimeWorker();
  }

  private raiseRealtimeTarget(height: bigint): void {
    if (height <= this.realtimeTarget) return;
    this.realtimeTarget = height;
    if (height > this.frontierHeight) this.frontierHeight = height;
    this.wakeWorker?.();
  }

  private async pollFrontier(): Promise<void> {
    try {
      const frontier = await zenonClient.getFrontierMomentum();
      this.nodeFailures = 0;
      this.raiseRealtimeTarget(BigInt(frontier.height));
    } catch (error) {
      console.error('Frontier poll failed:', error);
      this.noteNodeFailure();
    }
  }

  private checkStalled(): void {
    // A pause is deliberate, so it never counts as a stall
    if (this.paused) {
      this.lastProgressAt = Date.now();
      return;
    }

    const idleSeconds = (Date.now() - this.lastProgressAt) / 1000;
    if (idleSeconds < zenonConfig.stallExitSeconds) return;

    console.error(
      `No momentum indexed for ${zenonConfig.stallExitSeconds}s. Last indexed height: ${this.currentDbHeight}.`,
    );
    this.lastProgressAt = Date.now();
    this.stalled = true;
    this.requestNodeCheck('failover');
  }

  private noteNodeFailure(): void {
    // Failures during a pause must not queue a failover for the resume
    if (this.paused) return;
    this.nodeFailures++;
    if (this.nodeFailures >= FAILOVER_AFTER_FAILURES) this.requestNodeCheck('failover');
  }

  private requestNodeCheck(kind: 'failover' | 'failback'): void {
    if (this.nodeCheckDue !== 'failover') this.nodeCheckDue = kind;
    this.wakeWorker?.();
    this.cancelRetryWait?.();
  }

  /**
   * Run a requested node switch. Called between batches so no indexing call
   * is in flight. Exits with code 1 when a failover finds no healthy node,
   * so the restart policy keeps trying.
   */
  private async runNodeCheck(): Promise<void> {
    const kind = this.nodeCheckDue;
    if (!kind) return;
    this.nodeCheckDue = null;

    const anchor = await this.loadAnchor();
    if (kind === 'failback') {
      await zenonClient.failback(anchor);
      return;
    }

    this.nodeFailures = 0;
    this.lastProgressAt = Date.now();
    if (!(await zenonClient.failover(anchor))) {
      this.exitForRestart(`No healthy Zenon node. Last indexed height: ${this.currentDbHeight}.`);
    }
  }

  /** The last indexed momentum, which a node must share to be used. */
  private async loadAnchor(): Promise<ChainAnchor | null> {
    const height = this.currentDbHeight;
    if (!height || height <= 0n) return null;
    return { height, hash: await databaseService.getMomentumHash(height) };
  }

  private exitForRestart(message: string): void {
    console.error(`${message} Exiting.`);
    this.isRunning = false;
    clearInterval(this.stallTimer);
    clearInterval(this.frontierPollTimer);
    clearInterval(this.failbackTimer);
    clearInterval(this.controlTimer);
    // Release the lock first so the restarted process can take it at once.
    void this.releaseLock()
      .catch((error) => console.error('Failed to release lock:', error))
      .finally(() => process.exit(1));
  }

  private async waitForRetry(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.cancelRetryWait = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    this.cancelRetryWait = null;
  }

  private async runRealtimeWorker(): Promise<void> {
    let retryMs = RETRY_INITIAL_MS;

    while (this.isRunning) {
      await this.runNodeCheck();
      if (this.paused) await this.waitWhilePaused();
      if (!this.isRunning) break;

      if (this.currentDbHeight >= this.realtimeTarget) {
        await new Promise<void>((resolve) => {
          this.wakeWorker = resolve;
        });
        this.wakeWorker = null;
        continue;
      }

      const startHeight = this.currentDbHeight + 1n;
      const count = Math.min(
        zenonConfig.batchSize,
        Number(this.realtimeTarget - this.currentDbHeight),
      );
      const startedAt = Date.now();

      try {
        const indexed = await this.processBatch(
          Number(startHeight),
          count,
          Number(this.realtimeTarget),
        );
        if (indexed === 0) throw new Error(`Node returned no momentums from height ${startHeight}`);
        console.log(`Indexed to height ${this.currentDbHeight} in ${Date.now() - startedAt}ms`);
        this.nodeFailures = 0;
        retryMs = RETRY_INITIAL_MS;
      } catch (error) {
        console.error(
          `Failed to index from height ${this.currentDbHeight + 1n}, retrying in ${retryMs / 1000}s:`,
          error,
        );
        this.recordError(error);
        this.noteNodeFailure();
        // A due node switch runs at once instead of after the backoff
        if (!this.nodeCheckDue) await this.waitForRetry(retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      }
    }
  }

  isIndexerRunning(): boolean {
    return this.isRunning;
  }

  private getState(): 'starting' | 'historical' | 'realtime' | 'paused' | 'stalled' | 'stopping' {
    if (this.stopping) return 'stopping';
    if (this.paused) return 'paused';
    if (!this.isRunning) return 'starting';
    return this.stalled ? 'stalled' : this.phase;
  }

  async getStatus() {
    const state = await databaseService.getIndexerState();
    const stats = await databaseService.getStats();

    return {
      isRunning: this.isRunning,
      state: this.getState(),
      currentHeight: this.currentDbHeight,
      targetHeight: this.frontierHeight > 0n ? this.frontierHeight : null,
      lastProgressAt: this.lastCommitAt ? new Date(this.lastCommitAt).toISOString() : null,
      lastError: this.lastError
        ? { message: this.lastError.message, at: new Date(this.lastError.at).toISOString() }
        : null,
      node: zenonClient.activeUrl(),
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
