import type { Knex } from 'knex';
import type { AccountBlock, Momentum } from 'znn-typescript-sdk';
import { insertMomentum } from '../../actions/indexer/insert-momentum.js';
import { insertAccountBlock } from '../../actions/indexer/insert-account-block.js';
import { mapWithConcurrency } from '../../helpers/concurrency.js';
import { databaseService } from '../../services/database.js';
import { zenonClient } from '../../services/zenon-client.js';

const FETCH_CONCURRENCY = 32;

/** The node calls the backfill needs. */
export interface GenesisSource {
  getGenesisMomentum(): Promise<Momentum | null>;
  getAccountBlockByHash(hash: unknown): Promise<AccountBlock | null>;
}

export interface GenesisBackfillReport {
  /** Account blocks in momentum 1. */
  blocks: number;
  /** Account blocks newly stored by this run. */
  inserted: number;
}

/**
 * Stores momentum 1 and its genesis account blocks in a database that
 * started indexing above it. Runs once in one transaction. A second run
 * stores nothing: the momentum upserts on its hash and a stored block is
 * skipped. It leaves the indexer state and plugin watermarks alone and
 * dispatches no plugins.
 */
export async function backfillGenesis(
  db: Knex,
  source: GenesisSource,
): Promise<GenesisBackfillReport> {
  const momentum = await source.getGenesisMomentum();
  if (!momentum) {
    throw new Error('The node returned no momentum at height 1');
  }

  const blocks = await mapWithConcurrency(momentum.content ?? [], FETCH_CONCURRENCY, async (c) => {
    const block = await source.getAccountBlockByHash(c.hash);
    if (!block) {
      throw new Error(`Account block ${c.hash} not found for momentum 1`);
    }
    return block;
  });

  let inserted = 0;
  await db.transaction(async (tx) => {
    const momentumEvent = await insertMomentum(tx, momentum);
    for (const block of blocks) {
      if (await insertAccountBlock(tx, block, momentumEvent)) inserted++;
    }
  });

  return { blocks: blocks.length, inserted };
}

async function main() {
  await zenonClient.initialize();
  try {
    const report = await backfillGenesis(databaseService.getDb(), {
      getGenesisMomentum: async () =>
        (await zenonClient.getMomentumsByHeight(1, 1)).list[0] ?? null,
      getAccountBlockByHash: (hash) => zenonClient.getAccountBlockByHash(hash),
    });
    console.log(
      `✓ momentum 1: ${report.inserted} of ${report.blocks} genesis account blocks stored`,
    );
  } finally {
    await zenonClient.disconnect();
    await databaseService.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('db:backfill-genesis failed:', err.message);
      process.exit(1);
    });
}
