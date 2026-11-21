# Contributing

How to add a contract method handler, change the schema and run the tests. The handler rules themselves are in [indexer.md](indexer.md#action-dispatch).

## Adding a contract method handler

1. **The contract.** It must be in `EMBEDDED_CONTRACTS` (`src/constants/zenon.ts`) with its address, a display name such as `'Stake Contract'`, and a contract class whose `getFunctions()` lists the method. A contract the SDK lacks gets a local ABI class, as `PtlcContract` does (`src/constants/ptlc-contract.ts`).
2. **The method row.** The indexer recognises a call only when its fingerprint matches a row in `nom_contract_methods`. `syncContractMethods` (`src/database/contract-methods.ts`) adds every missing contract and ABI function: `db:seed` runs it on an empty database, and the indexer runs it on every start of a seeded one. No migration is needed.
3. **The handler.** Write `src/actions/process/<contract>/<method>.ts`, exporting an `ActionHandler` that takes an `ActionContext`. Follow the [handler conventions](indexer.md#handler-conventions): no validation, throw when a row the call depends on is missing, write only through `ctx.tx`.
4. **The registration.** Call `registerHandler('<Contract name>', '<MethodName>', handler)` in the folder's `index.ts`. Both strings must equal the `EMBEDDED_CONTRACTS` name and the ABI function name. A new contract folder must also be imported in `src/actions/process/index.ts`, or its handlers never register.
5. **The docs and tests.** Add the method to [Registered handlers](indexer.md#registered-handlers), and add a test under `tests/actions/process/<contract>/`.

Deploy the SDK update before the method goes live on chain. A call indexed while the method was unknown keeps `contract_method_id = null` and is never dispatched, and a later start does not revisit it. A method with no handler logs `No action handler registered for <Contract>.<Method>` once, and its calls are still stored with decoded arguments.

Helpers for handlers:

- `accountRegistry.getOrCreate(tx, address)` and `tokenRegistry.getOrLoad(tx, standard)` return ids.
- `pillarRegistry.setPillarId(producerAccountId, pillarId)` updates the producer cache after a pillar is created or its producer changes.
- `bareHex(value)` (`src/actions/process/htlc/hex.ts`) stores hash and bytes arguments as lower-case hex without `0x`.
- `expiryDate(seconds)` (`src/actions/process/expiry.ts`) turns a contract expiry time into a storable date.

## Migrations

Migrations are `.cjs` files in `src/database/migrations/`. Migrations 00000001 to 00000015 create the tables, one migration per domain, in foreign key order (see [schema.md](schema.md#tables-by-domain)). Never edit a migration that has shipped: databases that already ran it never run it again. Every schema change is a new migration, numbered from 00000016.

A new table orders its columns by type: `id`, foreign ids, integers and decimals, strings, text, json, booleans, then timestamps. Indexes follow the columns.

`npm run db:migrate:make <name>` creates a file with a Knex timestamp prefix in `src/database/migrations/`. Rename it to the next number.

A migration that adds a table or column needs nothing else. One that rewrites existing data must also work on a database that is already indexing, because it runs on the next start.

## Tests

`tests/` mirrors `src/`, for example `tests/actions/process/<contract>/<method>.test.ts` and `tests/services/indexer.test.ts`.

| Suite | Command | Needs | Config |
|-------|---------|-------|--------|
| Unit | `npm test` | Nothing | `vitest.config.ts`: `tests/**/*.test.ts` and `plugins/**/*.test.ts`, except `tests/db/` |
| Database | `npm run test:db` | The Compose Postgres, and a superuser in `DATABASE_USER` | `vitest.db.config.ts`: `tests/db/**/*.test.ts`, 60 s timeouts |

CI runs `npm run lint` and `npm test` on every pull request and push to `main`. It does not run `test:db`, so run it locally when you change a migration, a backfill script or the plugin registry.

**Unit tests.** `tests/setup.ts` sets dummy `DATABASE_*`, `ZNN_WS_URL`, `CHAIN_ID` and `REDIS_*` values and silences `console`. The mocks are in `tests/helpers/`:

- `makeMockTx()` returns a callable `tx('table')` with chainable query builder methods. `tx.resolveNext(value)` queues one result per query, in the order the code runs them. `.first()` or awaiting the builder takes the next result.
- `makeActionContext(overrides)` builds an `ActionContext` with defaults: send block id 10, amount `100000000`, frontier height 1000, 2024-01-01.
- `mock-knex.ts` and `mock-zenon.ts` mock a top-level Knex instance, momentums, account blocks, tokens and the node client.

Load the module under test with a top-level `await import(...)` after the mocks are set up, as `tests/actions/process/stake/stake.test.ts` does.

**Database tests.** `tests/db/setup.ts` loads `.env`. `createScratchDatabase(name)` (`tests/db/scratch.ts`) creates a database for the suite, creates schema `indexer`, runs every migration, and drops the database afterwards. Its name must end in `_test` and differ from `DATABASE_NAME`.

**Docs test.** `tests/docs/docs.test.ts` fails when a relative link or `#anchor` in `README.md`, `AGENTS.md` or `docs/*.md` does not resolve.
