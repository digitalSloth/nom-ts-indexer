# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

A TypeScript indexer for the Zenon Network blockchain. Fetches momentums and account blocks over the node's WebSocket RPC, catches up in batches, then follows new momentums in real time. Stores everything in PostgreSQL via the Knex query builder.

## Commands

```bash
# Development
npm run dev          # tsx watch — hot reload

# Build & run
npm run build        # sync plugin migrations, tsc compile → dist/, compile each plugin
npm start            # node dist/index.js

# Database
npm run db:migrate   # create schema indexer if missing, apply new migrations
npm run db:migrate:make <name>   # new migration (Knex timestamp prefix; rename to the next number)
npm run db:fresh     # drop schema indexer and re-run every migration (destructive)
npm run db:seed      # load genesis + network seed data once (needs npm run build first)
npm run reset        # db:fresh + db:migrate + db:seed
npm run db:sync-plugins               # copy enabled local plugins' migrations into src/database/migrations/plugins/
npm run db:backfill-accepted-at       # fill accepted_at for projects accepted before it was recorded (--dry-run lists them)
npm run db:backfill-genesis           # index momentum 1 and its genesis account blocks into a database that started above it (idempotent)
npm run lock:clear   # delete the lock and emergency_lock Redis keys

# Code quality
npm run lint
npm run lint:fix
npm run format
npm run format:check

# Tests
npm test
npm run test:watch
npm run test:coverage
npm run test:db      # real-Postgres tests: docker compose up -d postgres first
```

Test layout and mocks are in [docs/contributing.md](docs/contributing.md#tests).

## Architecture

### Data flow

```
Zenon Network (WebSocket RPC: batches for history, subscription + frontier poll for real time)
  → ZenonClient          (SDK wrapper: src/services/zenon-client.ts)
  → IndexerService       (orchestrator: src/services/indexer.ts)
  → Actions              (src/actions/indexer/)
  → Knex query builder   (src/database/)
  → PostgreSQL
```

### IndexerService lifecycle (`src/services/indexer.ts`)

1. Reads the last indexed height. Starts a 2 s control poll of the Redis keys `emergency_lock` (pause) and `restart` (one-shot), then waits there while paused
2. Connects to the first healthy node in `ZNN_WS_URL`, then acquires the Redis `lock` (prevents concurrent instances; a held lock throws)
3. On a seeded database, adds the contract methods the SDK defines that the database lacks. Loads the contract and pillar registries, initializes plugins and replays each plugin's missed blocks up to the indexed height
4. Fetches the frontier momentum height via RPC
5. Processes historical momentums in configurable batches (default 100)
6. Once caught up, a single worker indexes every new height in order. WebSocket notifications and a 30 s frontier poll only raise its target height. A failed height is retried with backoff (1 s doubling to 60 s) and never skipped
7. A pause set while running is honoured before the next batch in both loops. The instance lock stays held, and a pause counts as neither a stall nor a node failure. A `restart` key makes the process finish the momentum in flight and exit 0
8. Fails over to the first healthy node in `ZNN_WS_URL` order (possibly the current one) after 3 failed batches or polls in a row, or, in real-time mode, when no momentum is indexed for `STALL_EXIT_SECONDS`. While on a backup, checks every 5 minutes and switches to a higher-priority healthy node. A failover that finds no healthy node, and any startup failure, exits with code 1. See [docs/indexer.md](docs/indexer.md#node-failover)
9. On SIGINT/SIGTERM: stops the HTTP API, finishes the momentum in flight, shuts down plugins, releases the lock, closes the WebSocket, disconnects the DB

A momentum whose account block cannot be fetched fails and is retried. It is never committed without that block.

### Insert actions (`src/actions/indexer/`)

Each action runs inside a Knex transaction and returns event objects for plugin dispatch:

- `insertMomentum(tx, momentum)` — upserts a momentum, returns `IndexedMomentumEvent`
- `insertAccountBlock(tx, ab, momentumEvent)` — upserts a transaction, decodes contract data, runs ABI action dispatch, returns `IndexedAccountBlockEvent | null` (null on re-run/recovery)

Events are built from data already in scope during the insert — no DB re-read.

### Action dispatch (`src/actions/process/`)

Each `ContractReceive` block carries the call's status in its data (`1` success, `2` failure), stored as `nom_account_blocks.call_status`. Only successful calls are dispatched: `dispatchAction(tx, receiveBlock, pairedSendBlock, frontierMomentum)` resolves the contract method via `contractRegistry.getMethod()` and invokes its handler inside the same transaction. One handler per contract method, registered in each contract folder's `index.ts`.

Handlers never repeat contract validation, because the call already succeeded on chain. They record what the contract changed, and throw if a row the call depends on is missing. Contract rules that use the current height or time use `ctx.frontierMomentum` (the receive's acknowledged momentum). See [docs/indexer.md](docs/indexer.md#action-dispatch).

### Plugin system (`src/plugins/`)

Plugins implement `ZenonIndexerPlugin` and receive `IndexedAccountBlockEvent` / `IndexedMomentumEvent` after each transaction commits. Each handler writes through the `tx` it is given, the transaction in which the registry also moves the plugin's watermark (one per momentum live, one per 1000-momentum window in catch-up). Plugin failures never roll back indexer state. See [docs/plugins.md](docs/plugins.md).

### CI and `/health`

`.github/workflows/ci.yml` runs `npm run lint` and `npm test` on push to `main` and on every pull request. This repository has no deploy workflow. `/health` reports `state` (`starting`, `historical`, `realtime`, `paused`, `stalled`, `stopping`), heights, last progress time, last error and the image tag. Fields are listed in `README.md`.

### Registries (`src/services/registries/`)

In-memory caches, all singletons. `contractRegistry` and `pillarRegistry` load at startup. `accountRegistry` and `tokenRegistry` fill on demand as blocks reference addresses and tokens. Key to throughput — ~99% of lookups are O(1) Map hits.

### Webhooks (`src/webhooks/`)

Outbound HTTP callbacks fired after each momentum commits. Two event types: `momentum.inserted`, `account_block.inserted`. Configured via `webhooks.json` and env vars, combined. Fire-and-forget with 3 attempts, optional HMAC-SHA256 signing, never replayed. See [docs/webhooks.md](docs/webhooks.md).

### Configuration (`src/config/`)

All config via env vars or `.env`. Key vars:

| Var | Description |
|-----|-------------|
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | Postgres connection |
| `DATABASE_SSL`, `DATABASE_SSL_CA` | TLS with certificate verification, optional CA file |
| `REDIS_HOST/PORT/DB` | Redis for the instance lock and the pause and restart keys |
| `REDIS_KEY_PREFIX` | Prefix on every Redis key (default `indexer:`). One per network when indexers share a Redis database |
| `CHAIN_ID` | `1` = mainnet, `3` = testnet, `69` = local devnet (the `.env.example` value) |
| `ZNN_WS_URL` | Comma-separated WebSocket endpoints, primary first, for failover |
| `BATCH_SIZE` | Momentums per RPC fetch (1–1000) |
| `WEBHOOK_URL` | Optional single webhook endpoint |
| `PLUGINS_CONFIG_PATH` | Optional path to plugins JSON config (default: `plugins.json`) |
| `STALL_EXIT_SECONDS` | In real-time mode, fail over after this long without progress (default 300) |
| `GENESIS_PATH` | Genesis file for the seeders. The default `json/genesis.json` is not shipped, so set it to match `CHAIN_ID` |

The full list is in `README.md`.

Copy `.env.example` to `.env` to get started. A full local stack (Postgres 16, Redis 7) is in `docker-compose.yml`.

## Database Schema

40 core tables in schema `indexer` (`INDEXER_SCHEMA` in `src/database/schema.ts`): 38 prefixed `nom_`, plus `indexer_state` (sync height, seed marker) and `indexer_plugin_state` (plugin watermarks). Plugin tables and the Knex migration tables live in the same schema. Both Knex connections set `search_path` to it, so code and migrations use unqualified table names. `npm run db:migrate` creates the schema before Knex runs. Core tables: `nom_accounts`, `nom_tokens`, `nom_momentums`, `nom_account_blocks`. Supporting domains: pillars, staking, plasma, sentinels, QSR deposits, bridge, liquidity, accelerator, votes, HTLCs, PTLCs, sporks, legacy swap. Tables and storage conventions are in [docs/schema.md](docs/schema.md).

Uses Knex for query building. Migrations are `.cjs` files in `src/database/migrations/`: Migrations 00000001–00000015 create the tables, one migration per domain, in foreign key order. Never edit a migration that has shipped, because databases that already ran it never run it again. Every schema change is a new migration numbered from 00000016. A new table orders its columns: `id`, foreign ids, integers and decimals, strings, text, json, booleans, timestamps. `npm run db:migrate:make <name>` creates a timestamp-prefixed file, so rename it to the next number.

## TypeScript Notes

- ESM modules (`"module": "ES2022"`) — use `.js` extensions in local imports even for `.ts` source files
- `strict: false` — but `noImplicitReturns` is on
- The Knex singleton `db` is in `src/database/knex.ts`. Indexer code reaches it through the `databaseService` singleton (`src/services/database.ts`) with `databaseService.getDb()`. Scripts and seeders import `db` from `src/database/` directly
- All migrations, core and plugin, are `.cjs` (`extension: 'cjs'` in `src/database/knexfile.ts`). `npm run build` (or `npm run db:sync-plugins`) copies each enabled local plugin's `migrations/*.cjs` into `src/database/migrations/plugins/`, which Knex reads with the core directory. Plugin migration filenames must be globally unique
