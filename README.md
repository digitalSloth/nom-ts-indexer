# Zenon Network TypeScript Indexer

A standalone indexer for the Zenon Network blockchain. Fetches momentums and account blocks via HTTP RPC, switches to WebSocket for real-time updates, and stores everything in a relational database via Knex. Supports PostgreSQL (recommended), MySQL, and SQLite.

## Documentation

- [docs/indexer.md](docs/indexer.md) — architecture, data flow, batching, registries, partitioning, webhooks
- [docs/plugins.md](docs/plugins.md) — building plugins for the indexer

## Quick start

Two modes are supported. Pick whichever fits your workflow.

### Mode 1 — Dockerised DB + Redis, indexer on host (recommended for dev)

`docker compose up` brings up Postgres and Redis only. You run the indexer
directly on your host so you get hot reload, breakpoints, and fast iteration.

```bash
cp .env.example .env          # defaults to DATABASE_HOST=localhost / REDIS_HOST=localhost
docker compose up -d          # postgres + redis
npm install
npm run db:migrate
npm run db:seed
npm run dev                   # tsx watch
```

The default `DATABASE_*` / `REDIS_HOST` values in `.env.example` already
point at the dockerised services on `localhost`, so no edits are required
unless you've changed the Postgres credentials in `docker-compose.yml`.

### Mode 2 — Full stack in Docker

The indexer service is gated behind a Compose profile so it doesn't start
unless asked. One command builds the image, runs migrations + seeders, then
launches the indexer:

```bash
cp .env.example .env          # only ZNN_RPC_URL / ZNN_WS_URL need to be set
docker compose --profile full up -d
docker compose logs -f indexer
```

`DATABASE_HOST=postgres` and `REDIS_HOST=redis` are injected at the compose
service level, so your `.env` can keep its host-side `localhost` values
without conflict.

Both `db:migrate` and `db:seed` are idempotent, so restarting the container
is safe.

## Configuration

All configuration is via environment variables (or `.env`).

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | required | Connection string (postgres / mysql / sqlite) |
| `REDIS_HOST` | `localhost` | Distributed indexer lock |
| `REDIS_PORT` | 6379 | |
| `CHAIN_ID` | 1 | `1` = mainnet, `3` = testnet |
| `ZNN_RPC_URL` | `http://localhost:35997` | HTTP RPC endpoint |
| `ZNN_WS_URL` | `ws://localhost:35998` | WebSocket endpoint |
| `BATCH_SIZE` | 100 | Momentums per RPC fetch (1–1000) |
| `WEBHOOK_URL` | — | Optional single webhook endpoint |
| `WEBHOOK_SECRET` | — | Optional HMAC secret for `WEBHOOK_URL` |
| `WEBHOOK_EVENTS` | all | Comma-separated event filter |
| `PLUGINS_CONFIG_PATH` | `plugins.json` | Plugin configuration file |
| `API_PORT` | 3500 | HTTP API server port |

See [`.env.example`](.env.example) for the full file.

### Public nodes

| Network | RPC                            | WebSocket                    |
|---------|--------------------------------|------------------------------|
| Mainnet | `https://my.hc1node.com:35997` | `wss://my.hc1node.com:35998` |
| Testnet | `N/A`                          | `N/A`                        |
| Devnet  | `http://localhost:35997`       | `ws://localhost:35998`       |

## Commands

```bash
# Development
npm run dev              # tsx watch — hot reload
npm run build            # tsc compile
npm start                # node dist/index.js

# Database
npm run db:migrate       # run migrations (dev)
npm run db:fresh         # reset + migrate + generate (destructive)
npm run db:seed          # load genesis + network seed data

# Code quality
npm run lint
npm run lint:fix
npm run format

# Tests
npm test                 # run once
npm run test:watch       # watch mode
```

## Operations

### Monitoring

```bash
# Current sync height
docker compose exec postgres psql -U zenon -d nom_indexer \
  -c "SELECT last_indexed_momentum FROM indexer_state;"
```

### Emergency stop / resume

```bash
# Pause
docker compose exec redis redis-cli SET indexer:emergency_lock 1

# Resume (also clears stale main lock)
docker compose exec redis redis-cli DEL indexer:emergency_lock indexer:lock
```

### Resume after crash

The indexer persists the last committed height in `indexer_state`. On restart it reads that value and resumes. Each momentum updates the row inside its transaction, so a crash mid-momentum rolls back cleanly.

### Reset / reindex

```bash
npm run db:fresh      # drops and re-creates schema
npm run db:seed
```

## License

MIT
