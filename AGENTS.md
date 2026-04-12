# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

A TypeScript indexer for the Zenon Network blockchain. Fetches momentums and account blocks via HTTP RPC, switches to WebSocket for real-time updates, and stores everything in a relational database via Knex query builder. Supports PostgreSQL (recommended), MySQL, and SQLite.

## Commands

```bash
# Development
npm run dev          # tsx watch — hot reload

# Build & run
npm run build        # tsc compile → dist/
npm start            # node dist/index.js

# Database
npm run db:migrate   # run migrations (dev)
npm run db:fresh     # reset + migrate + generate (destructive)
npm run seed         # load genesis + network seed data
npm run prisma:studio # GUI database inspector

# Code quality
npm run lint
npm run lint:fix
npm run format

# Tests
npm test
```

## Architecture

### Data flow

```
Zenon Network (RPC → historical, WebSocket → real-time)
  → ZenonClient          (SDK wrapper: src/services/zenon-client.ts)
  → IndexerService       (orchestrator: src/services/indexer.ts)
  → Actions              (src/actions/indexer/)
  → Knex query builder   (src/database/)
  → PostgreSQL / MySQL / SQLite
```

### IndexerService lifecycle (`src/services/indexer.ts`)

1. Acquires a Redis lock (prevents concurrent instances)
2. Loads registries and initializes plugins
3. Fetches the frontier momentum height via RPC
4. Processes historical momentums in configurable batches (default 100)
5. Once caught up, switches to WebSocket subscription for real-time updates
6. On SIGINT/SIGTERM: releases lock, shuts down plugins, closes WebSocket, disconnects DB

### Insert actions (`src/actions/indexer/`)

Each action runs inside a Knex transaction and returns event objects for plugin dispatch:

- `insertMomentum(tx, momentum)` — upserts a momentum, returns `IndexedMomentumEvent`
- `insertAccountBlock(tx, ab, momentumEvent)` — upserts a transaction, decodes contract data, runs ABI action dispatch, returns `IndexedAccountBlockEvent | null` (null on re-run/recovery)

Events are built from data already in scope during the insert — no DB re-read.

### Action dispatch (`src/actions/process/`)

When a `ContractReceive` block is inserted, `dispatchAction(tx, receiveBlock, pairedSendBlock)` resolves the contract method via `contractRegistry.getMethod()` and invokes a handler inside the same transaction. One handler per contract method, registered in each contract folder's `index.ts`.

### Plugin system (`src/plugins/`)

Plugins implement `ZenonIndexerPlugin` and receive `IndexedAccountBlockEvent` / `IndexedMomentumEvent` after each transaction commits. Plugin failures never roll back indexer state. See [docs/plugins.md](docs/plugins.md).

### Registries (`src/services/registries/`)

In-memory caches loaded at startup. Singletons: `accountRegistry`, `tokenRegistry`, `pillarRegistry`, `contractRegistry`. Key to throughput — ~99% of lookups are O(1) Map hits.

### Webhooks (`src/webhooks/`)

Outbound HTTP callbacks fired after each momentum commits. Two event types: `momentum.inserted`, `account_block.inserted`. Configured via `webhooks.json` or env vars. Fire-and-forget with 3 attempts, optional HMAC-SHA256 signing.

### Configuration (`src/config/`)

All config via env vars or `.env`. Key vars:

| Var | Description |
|-----|-------------|
| `DATABASE_URL` | Knex connection string |
| `REDIS_HOST/PORT` | Redis for distributed locking |
| `CHAIN_ID` | `1` = mainnet, `3` = testnet |
| `ZNN_RPC_URL` | HTTP RPC endpoint |
| `ZNN_WS_URL` | WebSocket endpoint |
| `BATCH_SIZE` | Momentums per RPC fetch (1–1000) |
| `WEBHOOK_URL` | Optional single webhook endpoint |
| `PLUGINS_CONFIG_PATH` | Optional path to plugins JSON config (default: `plugins.json`) |

Copy `.env.example` to `.env` to get started. A full local stack (Postgres 16, Redis 7) is in `docker-compose.yml`.

## Database Schema

40+ tables all prefixed `nom_`. Core tables: `nom_chains`, `nom_accounts`, `nom_tokens`, `nom_momentums`, `nom_account_blocks`. Supporting domains: pillars, staking, plasma, sentinels, bridge, accelerator, votes. `indexer_state` tracks the current sync height.

Uses Knex for query building. Migrations are `.cjs` files in `src/database/migrations/`.

### Auto-Partitioning (PostgreSQL Only)

`nom_momentums` and `nom_account_blocks` are partitioned when they reach 5M rows. RANGE partitioning by `height`, 1M rows per partition. Check runs on startup and every 100k momentums during indexing.

## TypeScript Notes

- ESM modules (`"module": "ES2022"`) — use `.js` extensions in local imports even for `.ts` source files
- `strict: false` — but `noImplicitReturns` is on
- Database service is a singleton in `src/database/` — all others import via `databaseService.getDb()`
- Plugin migrations use `.cjs` format with `extension: 'cjs'` in Knex config
