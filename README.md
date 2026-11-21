# Zenon Network TypeScript Indexer

A standalone indexer for the Zenon Network blockchain. Fetches momentums and account blocks over the node's WebSocket RPC, catches up in batches, then follows new momentums in real time. Stores everything in PostgreSQL via Knex.

## Documentation

- [docs/indexer.md](docs/indexer.md) — architecture, data flow, batching, action dispatch, registries, seeders
- [docs/schema.md](docs/schema.md): the database tables and how values are stored
- [docs/webhooks.md](docs/webhooks.md): webhook configuration, payloads and signature verification
- [docs/plugins.md](docs/plugins.md) — building plugins for the indexer
- [docs/contributing.md](docs/contributing.md): adding a contract method handler, migrations and tests

## Quick start

Two modes are supported. Pick whichever fits your workflow. `.env.example` targets a local devnet node on `ws://localhost:35998`. For mainnet, switch to the commented mainnet block in `.env`.

### Mode 1 — Dockerised DB + Redis, indexer on host (recommended for dev)

`docker compose up` brings up Postgres and Redis only. You run the indexer
directly on your host so you get hot reload, breakpoints, and fast iteration.

```bash
./scripts/setup.sh            # .env, postgres + redis, install, build, migrate, seed
npm run dev                   # tsx watch, or npm start for the build
```

The script runs these steps, which you can also run by hand. It keeps an existing `.env` and is safe to re-run.

```bash
cp .env.example .env
docker compose up -d --wait postgres redis
npm ci
npm run build                 # db:seed runs from dist/
npm run db:migrate
npm run db:seed
```

The `DATABASE_*` and `REDIS_*` values in `.env.example` match the services in `docker-compose.yml`, so no edits are required unless you change the credentials there.

### Mode 2 — Full stack in Docker

The indexer service is gated behind a Compose profile so it doesn't start
unless asked. One command builds the image, runs migrations + seeders, then
launches the indexer:

```bash
cp .env.example .env
docker compose --profile full up -d --build
docker compose logs -f indexer
```

The compose service sets `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, `REDIS_HOST` and `REDIS_PORT` to the sibling services, and these override `.env`. Your `.env` can keep its host-side values. To use other database credentials in Mode 2, edit `docker-compose.yml`.

The node URLs are not overridden. Inside the container, `localhost` is the container itself, so point `ZNN_WS_URL` at `host.docker.internal` to reach a devnet node on the host. Docker Desktop resolves that name. On Linux, add `extra_hosts: ["host.docker.internal:host-gateway"]` to the `indexer` service first.

Restarting the container is safe. `db:migrate` applies only new migrations, and `db:seed` seeds an empty database once and skips a seeded one. A seed run that stopped partway makes `db:seed` fail until you run `npm run reset`. The compose command does not stop on that failure and starts the indexer anyway, so check the logs on first start.

## Configuration

All configuration is via environment variables (or `.env`).

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_HOST` | `localhost` | Postgres host |
| `DATABASE_PORT` | 5432 | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | empty | |
| `DATABASE_NAME` | `zenon_indexer` | |
| `DATABASE_SSL` | `false` | `true` connects over TLS and verifies the server certificate |
| `DATABASE_SSL_CA` | — | Optional path to a CA certificate file to trust, for providers with a private CA |
| `DATABASE_URL` | empty | Passed to plugins as `ctx.databaseUrl`. The indexer itself does not use it |
| `DB_MAX_CONNECTIONS` | 10 | Connection pool size |
| `REDIS_HOST` | `localhost` | Distributed indexer lock |
| `REDIS_PORT` | 6379 | |
| `REDIS_PASSWORD` | — | |
| `REDIS_DB` | 0 | |
| `REDIS_KEY_PREFIX` | `indexer:` | Prefix on every Redis key (`lock`, `emergency_lock`, `restart`). Use one prefix per network when indexers share a Redis database |
| `CHAIN_ID` | 1 | `1` = mainnet, `3` = testnet, `69` = local devnet (the `.env.example` value). Nodes on another chain id are skipped |
| `ZNN_WS_URL` | `ws://localhost:35998` | Node WebSocket endpoints, comma-separated, primary first. All RPC calls and the momentum subscription use the connected node. Later entries are failover backups |
| `BATCH_SIZE` | 100 | Momentums per RPC fetch (1–1000) |
| `START_HEIGHT` | — | On a database with no indexed momentum, treated as already indexed, so indexing starts at `START_HEIGHT + 1`. Balances and contract state then miss every block below it |
| `EXIT_AFTER_SYNC` | `false` | Exit after historical sync instead of following new momentums |
| `STALL_EXIT_SECONDS` | 300 | In real-time mode, fail over when no momentum is indexed for this long |
| `GENESIS_PATH` | `json/genesis.json` | Genesis file for the seeders and plugins. The default file is not shipped: set `json/genesis-mainnet.json` or `json/genesis-devnet.json` to match `CHAIN_ID` |
| `DEBUG` | `false` | Log the resolved Zenon configuration |
| `WEBHOOK_URL` | — | Optional single webhook endpoint |
| `WEBHOOK_SECRET` | — | Optional HMAC secret for `WEBHOOK_URL` |
| `WEBHOOK_EVENTS` | all | Comma-separated event filter for `WEBHOOK_URL` |
| `WEBHOOKS_CONFIG_PATH` | `webhooks.json` | Webhook subscriptions file, combined with `WEBHOOK_URL`. See [docs/webhooks.md](docs/webhooks.md) |
| `PLUGINS_CONFIG_PATH` | `plugins.json` | Plugin configuration file |
| `API_PORT` | 3500 | HTTP API server port |
| `INDEXER_IMAGE_TAG` | — | Reported as `imageTag` by `/health`. The Dockerfile sets it from the build arg `IMAGE_TAG` (default `dev`) |
| `NODE_ENV` | — | Any value other than `production` reuses one Knex instance across hot reloads |

See [`.env.example`](.env.example) for the full file.

### Public nodes

| Network | WebSocket                    |
|---------|------------------------------|
| Mainnet | `wss://my.hc1node.com:35998` |
| Testnet | `N/A`                        |
| Devnet  | `ws://localhost:35998`       |

## Commands

```bash
# Development
npm run dev              # tsx watch — hot reload
npm run build            # sync plugin migrations, tsc compile to dist/, compile each plugin
npm start                # node dist/index.js

# Database
npm run db:migrate       # create schema indexer if missing, apply new migrations
npm run db:migrate:make <name>   # new migration in src/database/migrations/ (rename it to the next number)
npm run db:seed          # load genesis + network seed data once (needs npm run build first)
npm run db:fresh         # drop schema indexer and re-run every migration (destructive)
npm run reset            # db:fresh + db:migrate + db:seed
npm run db:sync-plugins  # copy enabled local plugins' migrations into src/database/migrations/plugins/
npm run db:backfill-genesis           # index momentum 1 and its genesis account blocks into a database that started above it (idempotent)
npm run db:backfill-accepted-at       # fill accepted_at for projects accepted before it was recorded (--dry-run lists them)
npm run lock:clear       # delete the lock and emergency_lock Redis keys

# Code quality
npm run lint
npm run lint:fix
npm run format
npm run format:check

# Tests
npm test                 # run once
npm run test:watch       # watch mode
npm run test:coverage    # run once with coverage
npm run test:db                          # Postgres tests (docker compose up -d postgres)
```

`test:db` needs the Compose Postgres and a superuser in `DATABASE_USER` (`zenon` locally). It creates and drops scratch databases named `*_test`. See [docs/contributing.md](docs/contributing.md#tests) for the test layout.

## Managed Postgres privileges

On a managed host the indexer user (`DATABASE_USER`) is not a superuser, so these steps run on the indexer's database only, each as the role it names. Replace `zenon` and `nom_indexer` with `DATABASE_USER` and `DATABASE_NAME`.

Grants on a database and on its `public` schema take effect only when the database owner runs them (a non-owner gets `WARNING: no privileges were granted` and nothing changes), so find the owner first while connected to `nom_indexer`:

```sql
SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database();
```

1. As the database owner, before `npm run db:migrate` creates schema `indexer` (on a new install or an upgrade):

   ```sql
   GRANT CREATE ON DATABASE nom_indexer TO zenon;
   REVOKE CREATE ON SCHEMA public FROM PUBLIC;
   ```

   Skip the first statement when the owner is `zenon`, which already holds it. The indexer creates and owns the schema, so it needs `CREATE` on the database and nothing in `public`. Databases created before Postgres 15 still let every role create objects in `public`, and the revoke closes that.
2. Run `npm run db:migrate` as the indexer user.

## Operations

### Monitoring

```bash
# Current sync height
docker compose exec postgres psql -U zenon -d nom_indexer \
  -c "SELECT last_indexed_momentum FROM indexer.indexer_state;"
```

`GET /health` on `API_PORT` (default 3500) returns:

| Field | Value |
|-------|-------|
| `healthy` | `true` from the moment the indexer holds the lock until it stops, including while paused or stalled. Use `state` or `lastProgressAt` to alert on progress |
| `state` | `starting`, `historical`, `realtime`, `paused`, `stalled` or `stopping`. `historical` is the catch-up to the frontier and `realtime` follows the chain. `stalled` means the watchdog fired after `STALL_EXIT_SECONDS` without a momentum and no commit has happened since |
| `currentHeight` | Last indexed momentum height, as a string |
| `targetHeight` | Highest height seen from the node, as a string, or `null` before the first read |
| `lastProgressAt` | ISO time of the last committed momentum, or `null` |
| `lastError` | `{ message, at }` of the last indexing error, or `null` |
| `node` | WebSocket URL of the node in use |
| `startedAt` | Process start time |
| `imageTag` | `INDEXER_IMAGE_TAG`, or `null` when unset. The image sets it from the build arg `IMAGE_TAG` (`dev` unless given) |
| `stats` | `{ momentums, accountBlocks, accounts, tokens, pillars }`: Postgres row estimates, `0` before a table is first analysed |

The response is always HTTP 200, also when `healthy` is `false`. The route answers 500 only when the status cannot be read, for example when Postgres is down. The API starts before the indexer, so it reports `starting` while the process waits for the pause key or the lock.

### Emergency stop / resume

The keys below carry the `REDIS_KEY_PREFIX` (default `indexer:`). A running indexer reads them every 2 seconds.

```bash
# Pause: indexing stops after the current batch. The process keeps its lock and the node connection.
docker compose exec redis redis-cli SET indexer:emergency_lock 1

# Resume
docker compose exec redis redis-cli DEL indexer:emergency_lock

# Restart: the process finishes the momentum in flight, exits with code 0 and the restart policy starts it again
docker compose exec redis redis-cli SET indexer:restart 1 EX 120

# The lock expires 30 s after a crash. Delete it only to restart sooner (a live indexer, paused or not, must keep its lock)
docker compose exec redis redis-cli DEL indexer:lock
```

A process that starts while the pause key is set waits without connecting to a node or taking the lock, and begins when the key is deleted. `npm run lock:clear` deletes both `lock` and `emergency_lock`, so it also resumes a paused indexer. Running it while an indexer is live lets a second instance start.

### Resume after crash

Each momentum commits in its own transaction, which also records its height in `indexer_state`. On restart the indexer resumes from that height. Momentums and blocks already stored are matched by hash and not applied twice.

### Node failover

List backup nodes after the primary in `ZNN_WS_URL`:

```bash
ZNN_WS_URL=wss://primary.example:35998,wss://backup.example:35998
```

The indexer connects to the first healthy node. It fails over after 3 failed batches or frontier polls in a row, or, in real-time mode, when no momentum is indexed for `STALL_EXIT_SECONDS`. A failover reconnects to the first healthy node in list order, which can be the current one. While on a backup it checks every 5 minutes and switches to a higher-priority node once one is healthy. A node is skipped when it is unreachable, on another chain, behind the indexed height, holds a different momentum at that height, or trails the most advanced healthy node by more than 10 momentums. See [docs/indexer.md](docs/indexer.md#node-failover).

If no node is healthy during a failover, the indexer logs the last height, releases its lock and exits with code 1. A startup failure, such as no healthy node or a lock held by another instance, also exits with code 1. Run it under a restart policy (the Compose service uses `unless-stopped`) so it retries.

### Maintenance scripts

| Command | When to run it | Notes |
|---------|----------------|-------|
| `npm run db:backfill-genesis` | Once, on a database that started indexing above momentum 1 | Fetches momentum 1 and its account blocks from the node and stores them in one transaction. Idempotent. Changes no sync height or plugin watermark, and fires no webhooks or plugin events |
| `npm run db:backfill-accepted-at` | Once, on a database indexed before `accepted_at` was recorded | Database only. Replays accelerator votes and updates to find when each project passed, and fills only empty `accepted_at` values. `--dry-run` lists the projects and writes nothing. Exits 1 on any mismatch with a project's status |
| `npm run db:sync-plugins` | Before `npm run db:migrate` without a full build | `npm run build` runs it first. See [docs/plugins.md](docs/plugins.md#migrations) |
| `npm run lock:clear` | Only when no indexer is running | Deletes `lock` and `emergency_lock` |

### Reset / reindex

```bash
npm run reset         # drop the indexer schema, migrate, seed
```

`db:fresh` drops schema `indexer` and re-runs every migration. Every row id changes, so anything that stores data from the indexer must key it by address, hash and token standard, not by id.

## License

MIT
