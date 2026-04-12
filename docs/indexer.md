# Indexer Architecture

How data flows from the Zenon Network into the database. Covers the ingestion pipeline, action dispatch, registries, partitioning, seeders, and webhooks.

For building plugins, see [plugins.md](plugins.md).

## Data flow

```
Zenon Network
   │
   │  HTTP RPC (historical)            WebSocket (real-time)
   ▼                                   ▼
ZenonClient .................. src/services/zenon-client.ts
   │
   ▼
IndexerService ............... src/services/indexer.ts
   │
   ├─► insertMomentum         src/actions/indexer/insert-momentum.ts
   ├─► insertAccountBlock     src/actions/indexer/insert-account-block.ts
   │      │
   │      └─► dispatchAction  src/actions/process/dispatcher.ts
   │
   ├─► pluginRegistry          src/services/plugin-registry.ts
   │
   └─► webhookDispatcher       src/webhooks/dispatcher.ts
```

## Entry point and boot order

`src/index.ts`:

1. `dotenv.config()`
2. `databaseService.connect()`
3. `indexerService.start()`
4. Wires SIGINT / SIGTERM / unhandled rejection to graceful shutdown.

`IndexerService.start()`:

1. `zenonClient.initialize()` — opens RPC + WS clients.
2. `obtainLock()` — Redis-backed distributed lock with 30s TTL, extended every 20s. Fails fast if `indexer:emergency_lock` is set.
3. `partitionManager.checkAndPartition()` — converts huge tables to partitioned ones on PostgreSQL.
4. Preload registries from the database.
5. Load and initialize plugins.
6. Read `indexer_state.lastIndexedMomentum`.
7. Read network frontier height.
8. If behind: enter historical batch loop.
9. Once caught up: subscribe to WebSocket stream.

Shutdown unsubscribes, releases lock, shuts down plugins, and disconnects the database.

## IndexerService lifecycle

### Resume point

A single row in `indexer_state`:

| Column | Meaning |
|--------|---------|
| `lastIndexedMomentum` (BigInt) | Height of the most recent committed momentum |
| `isRunning` (Boolean) | True while the service holds the lock |
| `updatedAt` | Touched on every commit |

### Historical batch loop

```ts
while (currentHeight < frontierHeight - 1) {
  const momentums = await zenonClient.getMomentumsByHeight(startHeight, batchSize);
  const blocksByHash = await fetchAccountBlocksForBatch(momentums);

  for (const momentum of momentums) {
    await processOneMomentum(momentum, blocksByHash.get(momentum.hash));
  }

  await databaseService.updateIndexerState({ lastIndexedMomentum: lastHeight });

  if (currentHeight % 100_000 === 0) await partitionManager.checkAndPartition();
}
```

Key points:

- **Batch size** from `BATCH_SIZE` env var (1–1000, default 100).
- **Frontier-minus-one**: we never index the network's current tip — it can still be rejected.
- **Webhooks and plugins fire after commit** — failures never roll back indexer state.

### `processOneMomentum`

Each momentum is processed in a single transaction:

1. `insertMomentum` — upserts the momentum row, returns an `IndexedMomentumEvent`.
2. `insertAccountBlock` for each block — upserts the block, runs ABI action dispatch, returns an `IndexedAccountBlockEvent`.
3. After commit: dispatch webhooks and plugin events using the pre-built events.

The events are built from data already in scope during the insert — no DB re-read required.

### Real-time path

After the batch loop catches up, `zenonClient.subscribeToMomentums(callback)` opens a WS subscription. Each incoming momentum runs through `processSingleMomentum` — same code path as historical, just one momentum at a time.

## Action dispatch

After an account block is inserted, `dispatchAction(tx, accountBlock, pairedBlock)` runs inside the same transaction:

1. Only `ContractReceive` blocks trigger further work.
2. Looks up the paired send block.
3. Skips if the send wasn't ABI-recognised (no `contractMethodId`).
4. Resolves `{ contractName, methodName }` via `contractRegistry.getMethod()`.
5. Invokes the matching handler — one per contract method.

### Handler layout

```
src/actions/process/
├── dispatcher.ts            # invokes a registered handler
├── registry.ts              # registerHandler / getHandler
├── types.ts                 # ActionContext, ActionHandler
├── index.ts                 # imports each contract folder
├── pillar/                  # Register, RegisterLegacy, UpdatePillar, Revoke, Delegate, Undelegate
├── token/                   # IssueToken, UpdateToken, Mint, Burn
├── plasma/                  # Fuse, CancelFuse
├── stake/                   # Stake, Cancel
├── sentinel/                # Register, Revoke
└── liquidity/               # LiquidityStake, CancelLiquidityStake
```

Handlers are registered in each folder's `index.ts`:

```ts
import { registerHandler } from '../registry.js';
import { register } from './register.js';
registerHandler('Pillar Contract', 'Register', register);
```

### ActionContext

```ts
interface ActionContext {
  tx: any;                     // knex transaction — use for every DB operation
  receiveBlock: {
    id: number;
    momentumId: number;
    createdAt: Date;
  };
  sendBlock: {
    id: number;
    accountId: number;
    toAccountId: number;
    tokenId: number | null;
    amount: string;            // decimal string, e.g. "15000000000"
    hash: string;
    createdAt: Date;
  };
  decoded: Record<string, any>; // ABI-decoded args
}
```

### Handler conventions

- **Idempotency**: handlers can be invoked twice for the same block (crash recovery). Use `findFirst` before `create`, or filter by `endedAt: null` for cancel-style operations.
- **Validation**: `throw` for malformed input. `console.warn` + `return` for valid-but-skippable cases (zero amounts, missing entities). Never silently swallow.
- **Registries**: use `accountRegistry.getOrCreate(tx, address)` — never call the DB directly for account lookups.

### Registered handlers

| Contract | Method | Handler | Tables |
|----------|--------|---------|--------|
| Pillar Contract | Register, RegisterLegacy | `pillar/register*.ts` | `nom_pillars` |
| Pillar Contract | UpdatePillar | `pillar/update-pillar.ts` | `nom_pillars`, `nom_pillar_update_histories` |
| Pillar Contract | Revoke | `pillar/revoke.ts` | `nom_pillars` |
| Pillar Contract | Delegate, Undelegate | `pillar/delegate.ts`, `pillar/undelegate.ts` | `nom_delegations` |
| Token Contract | IssueToken, UpdateToken | `token/issue-token.ts`, `token/update-token.ts` | `nom_tokens` |
| Token Contract | Mint, Burn | `token/mint.ts`, `token/burn.ts` | `nom_token_mints/burns`, `nom_tokens` |
| Plasma Contract | Fuse, CancelFuse | `plasma/fuse.ts`, `plasma/cancel-fuse.ts` | `nom_plasma` |
| Stake Contract | Stake, Cancel | `stake/stake.ts`, `stake/cancel.ts` | `nom_stakes` |
| Sentinel Contract | Register, Revoke | `sentinel/register.ts`, `sentinel/revoke.ts` | `nom_sentinels` |
| Liquidity Contract | LiquidityStake, CancelLiquidityStake | `liquidity/*.ts` | `nom_stakes` |

## Registries

In-memory caches under `src/services/registries/`. All singletons, loaded once at startup.

| Registry | Caches | Hot path | Notes |
|----------|--------|----------|-------|
| `accountRegistry` | `address → accountId` | `getOrCreate(tx, address)` | LRU, 500k entries. Cache miss does an upsert. |
| `tokenRegistry` | `tokenStandard → tokenId` | `getOrLoad(tx, zts)` | On miss: DB lookup → SDK RPC → upsert. |
| `pillarRegistry` | `producerAccountId → pillarId` | `getPillarId(producerAccountId)` | Loaded at startup. Handlers call `setPillarId` after creating/rotating a pillar. |
| `contractRegistry` | `accountId → contractName`, `(contractName, fingerprint) → methodId`, `methodId → { contractName, methodName }` | `getContractName`, `getMethodId`, `getMethod` | Read-only at handler time. |

The registries are key to throughput — ~99% of lookups are O(1) Map hits.

## Partitioning

PostgreSQL only. `src/database/partition-manager.ts`.

| Setting | Value |
|---------|-------|
| Tables | `nom_momentums`, `nom_account_blocks` |
| Trigger threshold | 5,000,000 rows |
| Strategy | RANGE on `height`, 1M rows per partition |
| Re-check cadence | Startup + every 100k momentums during historical indexing |

When the threshold is reached:

1. Rename existing table → `<name>_old`.
2. Create new partitioned parent.
3. Create partitions covering existing range + two future ranges.
4. `INSERT INTO <name> SELECT * FROM <name>_old`.
5. Recreate indexes.
6. Drop `<name>_old`.

All queries continue working unchanged — PostgreSQL handles partition routing transparently.

## Seeders

`src/seeders/`. Run via `npm run seed`. Order:

1. **Network seeders** — embedded contract accounts, tokens, bridge networks, contract methods.
2. **Genesis seeders** — accounts, pillars, momentums, account blocks from `json/genesis.json`.

All seeders are upsert-only and safe to re-run.

## Webhooks

Loaded once at startup from `webhooks.json` (or `WEBHOOK_URL` env var). Two event types:

- `momentum.inserted` — fired after each momentum commits.
- `account_block.inserted` — fired per account block.

Delivery is fire-and-forget with 3 attempts and exponential backoff. If `secret` is set, requests include `X-Webhook-Signature: sha256=<hex>`.

Configuration is read once on startup — restart to change endpoints.

## Database schema

40+ tables, all prefixed `nom_`. Core tables: `nom_chains`, `nom_accounts`, `nom_tokens`, `nom_momentums`, `nom_account_blocks`. Supporting domains: pillars, staking, plasma, sentinels, bridge, accelerator, votes. `indexer_state` tracks current sync height.

Uses Knex for query building. Migrations are `.cjs` files in `src/database/migrations/`.
