# Indexer Architecture

How data flows from the Zenon Network into the database. Covers the ingestion pipeline, action dispatch, registries, seeders, and webhooks.

For the tables, see [schema.md](schema.md). For webhook payloads, see [webhooks.md](webhooks.md). For building plugins, see [plugins.md](plugins.md).

## Data flow

```
Zenon Network
   │
   │  WebSocket RPC: momentum batches (both modes); subscription + frontier poll set the real-time target
   ▼
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
2. `connectDatabase()` (`src/database/knex.ts`)
3. `apiServer.start(apiConfig.port)`: serves `/health`
4. `indexerService.start()`. With `EXIT_AFTER_SYNC=true`, the process shuts down once historical sync ends.
5. Wires SIGINT, SIGTERM, uncaught exceptions and unhandled rejections to graceful shutdown.

`IndexerService.start()`:

1. Read the resume height (`databaseService.getCurrentHeight()`).
2. Start the control poll (2 s): it reads `emergency_lock` and consumes `restart`. While `emergency_lock` is set, wait here without a node connection or lock.
3. `zenonClient.initialize(anchor)` — connects to the first healthy node in `ZNN_WS_URL` (see [Node failover](#node-failover)).
4. `obtainLock()` — Redis-backed instance lock (`lock`) with 30s TTL, extended every 20s. Throws if another instance holds it. Then sets `indexer_state.is_running`.
5. On a seeded database, add any embedded contract methods the SDK defines that `nom_contract_methods` lacks (`syncContractMethods`). Then preload `contractRegistry` and `pillarRegistry`.
6. Load and initialize plugins, then `pluginRegistry.catchUp()` replays the blocks each plugin has not seen.
7. Read the network frontier height and start the 5 min failback timer.
8. If behind: enter historical batch loop.
9. With `EXIT_AFTER_SYNC=true`, stop here. Otherwise start the real-time worker.

### Pause and restart

Both loops check the pause before each batch, so a batch never pauses midway. While paused the process keeps `lock` alive, counts no stall, and counts no node failure. In real-time mode the subscription and frontier poll keep raising the target height. The `restart` key (set with a 120 s TTL) is consumed once and sends the process SIGTERM, which ends the batch after the momentum in flight and exits with code 0. All keys carry `REDIS_KEY_PREFIX`.

Shutdown stops the API server, then `stop()` unsubscribes, waits for the momentum in flight, clears `is_running`, shuts down plugins and releases `lock`. The node connection and the database close last.

## IndexerService lifecycle

### Resume point

A single row in `indexer_state`:

| Column | Meaning |
|--------|---------|
| `last_indexed_momentum` (bigint) | Height of the most recent committed momentum |
| `is_running` (boolean) | Set after the lock is taken, cleared by `stop()`. A crash or a no-healthy-node exit leaves it set |
| `seeded_at` | Set once `db:seed` finishes (see [Seeders](#seeders)) |
| `updated_at` | Touched on every commit |

When `last_indexed_momentum` is 0, indexing resumes above `START_HEIGHT` if it is set, otherwise above the highest stored momentum.

### Historical batch loop

```ts
while (currentHeight < frontierHeight) {
  const momentums = await zenonClient.getMomentumsByHeight(startHeight, batchSize);
  const blocksByHash = await fetchAccountBlocksForBatch(momentums);

  for (const momentum of momentums) {
    await processOneMomentum(momentum, blocksByHash.get(momentum.hash));
  }
}
```

Key points:

- **Batch size** from `BATCH_SIZE` env var (1–1000, default 100).
- **Up to the frontier**: historical sync and the real-time worker both index up to and including the frontier momentum.
- **Webhooks and plugins fire after commit** — failures never roll back indexer state.
- **Missing blocks fail the batch.** If the node returns no block for a hash in a momentum's content, the momentum is not committed.

### `processOneMomentum`

Each momentum is processed in a single transaction:

1. `insertMomentum` — upserts the momentum row, counts it towards its producer pillar (resetting every pillar's epoch count at a new epoch), sets the expiry of time challenges that end with it, and returns an `IndexedMomentumEvent`.
2. `insertAccountBlock` for each block — inserts the block, links its paired and descendant blocks, runs ABI action dispatch and updates balances, then returns an `IndexedAccountBlockEvent`. A block already stored returns `null` and writes nothing, so plugins skip it.
3. `refreshPillarRanks` — recomputes pillar ranks when a weight, registration or revocation in this momentum changed them (see [schema.md](schema.md#pillar-metrics)).
4. `setLastIndexedMomentum` — stores the momentum's height in `indexer_state`, so the resume point always matches the last committed momentum.
5. After commit: dispatch webhooks, then plugin events, using the pre-built events. Plugin dispatch is awaited, so a slow plugin slows indexing. After a crash before dispatch, the restart resumes above the momentum and plugin catch-up replays its account blocks (`onMomentum` is not replayed). Webhooks are not replayed.

The events are built from data already in scope during the insert — no DB re-read required.

### Real-time path

After the batch loop catches up, one worker indexes new momentums with the same `processBatch` path as historical sync.

- **Target height.** The WebSocket subscription and a 30 s `getFrontierMomentum` poll only raise the worker's target height. The poll covers notifications lost after a reconnect, because the SDK reconnects the socket but does not resubscribe.
- **In order, never skipped.** The worker indexes `currentHeight + 1` up to the target. A missed notification (N, then N+2) still indexes N+1.
- **Retries.** A failed batch is retried from the failed height with backoff, 1 s doubling to 60 s. Historical sync retries the same way, except that an empty batch from the node ends historical sync and hands over to the real-time worker.
- **Stalls.** In real-time mode, if no momentum is indexed for `STALL_EXIT_SECONDS` (default 300), the indexer fails over (see below). Historical sync has no stall check.
- **Shutdown.** `stop()` waits for the momentum in flight.

### Node failover

`ZNN_WS_URL` lists one or more nodes, primary first. `src/services/zenon-client.ts` holds one connection, and `src/services/node-probe.ts` checks the nodes over separate short-lived WebSockets.

A node is healthy when all of these hold:

1. It answers within 10 s.
2. It reports the configured `CHAIN_ID`.
3. Its frontier has reached the last indexed height, and its momentum at that height has the hash stored in `nom_momentums`.
4. Its frontier trails the most advanced healthy node by at most 10 momentums.

Switches:

- **Startup** connects to the first healthy node in list order.
- **Failover** runs after 3 failed batches or frontier polls in a row, or a real-time stall. It reconnects to the first healthy node, which may be the current one, and restores the momentum subscription.
- **Failback** runs every 5 minutes while on a backup, and moves to a higher-priority node once it is healthy.
- **No healthy node** on a failover releases the lock and exits with code 1, for the restart policy to retry.

Switches run between batches, so no indexing call is in flight. Every `ZenonClient` call times out after 60 s (a connect after 30 s), so an unresponsive node counts as a failure. The token lookup in `tokenRegistry` calls the SDK directly and has no timeout. Switching nodes cannot change indexed data: momentums are matched by hash, and the hash check rejects a node on another chain or fork.

## Action dispatch

Every embedded contract call ends in a `ContractReceive` block whose `data` holds an 8-byte status: `1` when the call succeeded, `2` when it failed. A failed call is fully rolled back on chain, and any funds it carried come back in a refund send. The indexer stores the status in `nom_account_blocks.call_status` on the receive, and sets `call_failed` on the paired send when the status is `2`, whichever of the two blocks is indexed first. A receive whose data is not an 8-byte status of `1` or `2` fails its momentum, which is then retried.

After a block is inserted, `insertAccountBlock` calls `dispatchAction(tx, receiveBlock, pairedSendBlock, frontierMomentum)` inside the same transaction when all of these hold:

1. The block is a `ContractReceive` with status `1`.
2. Its paired send block is ABI-recognised (it has a `contractMethodId`).

`dispatchAction` resolves `{ contractName, methodName }` via `contractRegistry.getMethod()`, reads the send block's decoded arguments and invokes the handler registered for that method. Methods with no handler are logged once.

Because only successful calls reach a handler, handlers never repeat the contract's validation. A handler records what the contract changed. Where that depends on more than the call's inputs, it models the contract's own logic: time challenges, vote tallies, payouts read from the receive's descendant blocks.

### Handler layout

```
src/actions/process/
├── dispatcher.ts            # invokes a registered handler
├── registry.ts              # registerHandler / getHandler
├── types.ts                 # ActionContext, ActionHandler
├── expiry.ts                # expiryDate(): clamps contract expiry times to a storable date
├── index.ts                 # imports each contract folder
├── accelerator/             # projects, phases, votes, payouts
├── bridge/                  # wraps, unwraps, networks, settings, governance shared with liquidity
├── htlc/                    # hashed timelocks and proxy unlock settings
├── ptlc/                    # point timelocks
├── liquidity/               # liquidity stakes, token tuples, settings
├── pillar/                  # pillars, delegations, QSR deposits
├── plasma/                  # fusions
├── sentinel/                # sentinels, QSR deposits
├── spork/                   # sporks
├── stake/                   # stakes
├── swap/                    # legacy swap retrievals
└── token/                   # tokens, mints, burns, rewards
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
  tx: Knex.Transaction;        // use for every DB operation
  receiveBlock: {
    id: number;
    momentumId: number;
    createdAt: Date;           // confirmation momentum time
  };
  frontierMomentum: {
    height: bigint;            // the receive's acknowledged momentum, which the
    timestamp: Date;           // contract reads as its frontier while it runs
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
  decoded: Record<string, any>; // ABI-decoded args: integers over 48 bits as decimal strings, smaller ones as numbers
}
```

Contract rules that use the current height or time (expiries, delays, enforcement heights, voting periods) use `frontierMomentum`, not `receiveBlock.createdAt`.

`dispatchAction` throws when a recognised method's send has no decoded arguments, so the momentum fails and is retried.

### Handler conventions

- **No validation.** The call already succeeded on chain. Do not check permissions, limits or state preconditions.
- **Lookups throw.** A row a successful call depends on must exist. If it is missing, throw `<Contract>.<Method>: <thing> not found for <key>`. The momentum then fails and is retried, so a divergence stops the indexer instead of corrupting data.
- **Descendant blocks.** A receive's descendant sends are linked (`parent_id`) before its handler runs. Read them when the contract's output depends on state the indexer does not hold, such as its balance.
- **Registries.** Use `accountRegistry.getOrCreate(tx, address)` for accounts and `tokenRegistry.getOrLoad(tx, standard)` for tokens.
- **Pillar metrics.** A handler that changes a delegation, registers or revokes a pillar, or adds or changes an Accelerator-Z item or vote keeps the metrics current through `src/actions/indexer/pillar-metrics.ts`. ZNN balance changes move pillar weight inside `updateAccountTokenBalance`.

### Registered handlers

| Contract | Methods | Tables |
|----------|---------|--------|
| Pillar | Register, RegisterLegacy, UpdatePillar, Revoke | `nom_pillars`, `nom_pillar_update_histories`, `nom_legacy_pillar_entries` |
| Pillar | Delegate, Undelegate | `nom_delegations`, `nom_pillars` (weight) |
| Pillar, Sentinel | DepositQsr, WithdrawQsr (Register consumes the deposit) | `nom_qsr_deposits` |
| Sentinel | Register, Revoke | `nom_sentinels` |
| Token | IssueToken, UpdateToken, Mint, Burn | `nom_tokens`, `nom_token_mints`, `nom_token_burns`, `nom_account_rewards`, `nom_account_tokens` (the token contract's balance) |
| Plasma | Fuse, CancelFuse | `nom_plasma` |
| Stake | Stake, Cancel | `nom_stakes` |
| Liquidity | LiquidityStake, CancelLiquidityStake, UnlockLiquidityStakeEntries | `nom_stakes` |
| Liquidity | SetTokenTuple, SetIsHalted, SetAdditionalReward | `nom_liquidity_token_tuples`, `nom_liquidity_settings`, `nom_time_challenges` |
| Liquidity | ChangeAdministrator, NominateGuardians, ProposeAdministrator, Emergency | `nom_liquidity_admins`, `nom_liquidity_guardians`, `nom_time_challenges`, `nom_liquidity_settings` |
| Accelerator | CreateProject, AddPhase, UpdatePhase, Update, Donate, VoteByName, VoteByProdAddress | `nom_accelerator_projects`, `nom_accelerator_phases`, `nom_votes`, `nom_pillars` (engagement) |
| Bridge | WrapToken, UpdateWrapRequest, UnwrapToken, Redeem, RevokeUnwrapRequest | `nom_bridge_wraps`, `nom_bridge_unwraps`, `nom_bridge_networks`, `nom_account_rewards` |
| Bridge | SetNetwork, RemoveNetwork, SetNetworkMetadata, SetTokenPair, RemoveTokenPair | `nom_bridge_networks`, `nom_bridge_network_tokens`, `nom_time_challenges` |
| Bridge | Halt, Unhalt, Emergency, ChangeTssECDSAPubKey, SetAllowKeyGen, SetBridgeMetadata, SetOrchestratorInfo | `nom_bridge_settings`, `nom_bridge_admins`, `nom_time_challenges` |
| Bridge | ChangeAdministrator, NominateGuardians, ProposeAdministrator | `nom_bridge_admins`, `nom_bridge_guardians`, `nom_time_challenges` |
| HTLC | Create, Unlock, Reclaim, AllowProxyUnlock, DenyProxyUnlock | `nom_htlcs`, `nom_accounts.is_htlc_proxy_unlock_allowed` |
| PTLC | Create, CreateWithReclaimLock, Unlock, ProxyUnlock, Reclaim, ReclaimWithSignature | `nom_ptlcs` |
| Spork | CreateSpork, ActivateSpork | `nom_sporks` |
| Swap | RetrieveAssets | `nom_swap_entries` |

Methods with no handler change no state the indexer keeps: `Update` and `CollectReward` on the reward contracts (rewards arrive as mints), liquidity `Fund`, `BurnZnn` and `Donate` (plain transfers), and bridge `SetRedeemDelay` (go-zenon has no implementation, so every call fails). Their calls are still stored with decoded arguments.

## Registries

In-memory caches under `src/services/registries/`, all singletons. `contractRegistry` and `pillarRegistry` load at startup. `accountRegistry` and `tokenRegistry` start empty and fill on demand.

| Registry | Caches | Hot path | Notes |
|----------|--------|----------|-------|
| `accountRegistry` | `address → accountId` | `getOrCreate(tx, address)` | LRU, 500k entries. Cache miss does an upsert. |
| `tokenRegistry` | `tokenStandard → tokenId` | `getOrLoad(tx, zts)` | On miss: DB lookup → SDK RPC → upsert. |
| `pillarRegistry` | `producerAccountId → pillarId` | `getPillarId(producerAccountId)` | Loaded at startup. Handlers call `setPillarId` after creating/rotating a pillar. |
| `contractRegistry` | `accountId → contractName`, `(contractName, fingerprint) → methodId`, `methodId → { contractName, methodName }` | `getContractName`, `getMethodId`, `getMethod` | Read-only at handler time. |

The registries are key to throughput — ~99% of lookups are O(1) Map hits.

## Seeders

`src/database/seeders/`. Run via `npm run db:seed` after `npm run build`. Order:

1. **Network seeders**: burn address, embedded contract accounts, ZNN and QSR, the bridge and liquidity starting state (administrator, settings rows), contract methods. The indexer also adds missing contract methods on every start, so a newer SDK's methods reach a seeded database.
2. **Genesis seeders**: account balances, pillars, legacy pillar entries, fusions, sporks and legacy swap entries. Genesis times come from `GenesisTimestampSec`.

The ZNN and QSR network seeder and the genesis seeders read the file at `GENESIS_PATH`. Its default, `json/genesis.json`, is not shipped. Set it to `json/genesis-mainnet.json` or `json/genesis-devnet.json` to match `CHAIN_ID`. The seeders do not check the chain id.

`db:seed` runs only on an empty database, and sets `indexer_state.seeded_at` once every seeder finishes. A later run sees the marker and skips, because the seeders overwrite indexed balances and supplies and would duplicate the genesis pillars. Seeded rows without the marker mean a seed run stopped partway, so `db:seed` exits with an error that tells you to run `npm run reset`.

## Webhooks

`src/webhooks/dispatcher.ts` posts `momentum.inserted` and `account_block.inserted` after each momentum commits, fire-and-forget. Configuration is read once at startup, so restart to change endpoints. Configuration, payloads, delivery and signature verification are in [webhooks.md](webhooks.md).

## Database schema

The tables, storage conventions and block linking are in [schema.md](schema.md).
