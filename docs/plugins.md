# Building Plugins

The indexer supports plugins that receive events as momentums and account blocks are indexed. Plugins can maintain their own database tables, perform custom indexing logic, and react to on-chain activity in real time.

## Overview

A plugin is a module that exports a factory function returning a `ZenonIndexerPlugin`. Plugins are loaded at startup based on `plugins.json` configuration. Each plugin:

- Receives a `PluginContext` during initialization with access to configuration, logging, and a database interface.
- Gets called for every account block indexed (`onAccountBlock`).
- Optionally gets called for every momentum (`onMomentum`).
- Can run cleanup logic on shutdown.

Events are delivered **after** the core transaction commits — plugin failures never roll back indexer state.

Each handler receives `tx`, a transaction the registry opens for the plugin. The registry moves the plugin's watermark in the same transaction, so a reader never sees a plugin row above the watermark. A plugin writes its rows through `tx`, never through `ctx.db`.

## Plugin interface

```ts
interface ZenonIndexerPlugin {
  readonly name: string;
  init(ctx: PluginContext): Promise<void>;
  onAccountBlock(event: IndexedAccountBlockEvent, tx: Knex.Transaction): Promise<void>;
  onMomentum?(momentum: IndexedMomentumEvent, tx: Knex.Transaction): Promise<void>;
  shutdown(): Promise<void>;
}
```

## PluginContext

```ts
interface PluginContext {
  config: Record<string, unknown>;  // from plugins.json
  log: PluginLogger;                // info/warn/error
  db: PluginDb;                     // Knex instance (+ legacy execute/query)
  databaseUrl: string;              // DATABASE_URL env var, empty unless set
  genesisPath: string;              // path to genesis.json
}
```

The `db` interface is a full Knex instance. Use it in `init()` and for reads. Event handlers write through their `tx` argument (see "Watermark / catch-up"). Use the query builder for all database operations:

```ts
// Query with builder
const row = await ctx.db('my_table').where({ id: 5 }).first();
const rows = await ctx.db('my_table').where('amount', '>', 100).select('*');

// Insert
await ctx.db('my_table').insert({ account_id: 1, amount: '100' });

// Update
await ctx.db('my_table').where({ id: 5 }).update({ amount: '200' });

// Transactions
await ctx.db.transaction(async (tx) => {
  await tx('my_table').insert({ account_id: 1, amount: '100' });
  await tx('other_table').where({ id: 1 }).increment('count', 1);
});
```

### Legacy `execute` / `query` methods

For backward compatibility, `db` also has `execute` and `query` methods that accept raw SQL with `$1`, `$2` PostgreSQL-style placeholders (automatically converted to Knex `?` style internally):

```ts
// Legacy — prefer the query builder for new code
const rows = await ctx.db.query<{ id: number }>('SELECT id FROM my_table WHERE account_id = $1', accountId);
await ctx.db.execute('INSERT INTO my_table (account_id, amount) VALUES ($1, $2)', accountId, amount);
```

These helpers are for `init()`. An event handler runs raw SQL as `tx.raw(sql, bindings)` with `?` placeholders, because `tx` has no `execute` or `query`.

## IndexedAccountBlockEvent

This is the event delivered to `onAccountBlock`. Live events are built during the insert action from data already in scope. Catch-up events are rebuilt from the core tables.

```ts
interface IndexedAccountBlockEvent {
  accountBlockId: number;
  hash: string;
  blockType: number;
  height: bigint;
  fromAddress: string;
  toAddress: string;
  amount: string;
  tokenStandard: string | null;
  rawData: Buffer;
  decodedArgs: Record<string, unknown> | null;
  momentum: IndexedMomentumEvent;
  contractMethod: { contractName: string; methodName: string } | null;
  pairedBlockHash: string | null;
  callStatus: number | null;
}
```

Key fields:

- `contractMethod` — set when the block calls a known embedded contract method. Contains `{ contractName, methodName }` (e.g. `"Stake Contract"`, `"Stake"`).
- `decodedArgs` — ABI-decoded arguments as an object, with `bigint` values as strings. For a block that is not a known contract call, it is the block data parsed as JSON when that data is a JSON object. Otherwise it is `null`.
- `pairedBlockHash` — the hash of the other side of the send/receive pair, or `null` when that side is not known. Live, it is the paired block the node reported when the block was fetched, so a send can arrive with `null` before its receive exists. In catch-up, it is the pair the indexer has linked in `nom_account_blocks`.
- `callStatus` — set on contract receive blocks only. `1` means the contract call succeeded, `2` means it failed and the chain rolled it back. A failed call that carried funds is refunded by a descendant send. Ignore failed calls when you track contract state.
- `rawData` — the raw calldata buffer. This is pre-decoded by the core — do not base64-decode it again.

## IndexedMomentumEvent

```ts
interface IndexedMomentumEvent {
  momentumId: number;
  height: bigint;
  hash: string;
  timestamp: number;
}
```

## Project structure

A plugin lives in `plugins/<name>/`:

```
plugins/my-plugin/
├── package.json
├── tsconfig.json
├── migrations/          # Knex migrations (.cjs files)
├── src/
│   ├── index.ts         # factory function (default export)
│   └── ...              # handler logic
└── tests/
```

### Build and loading

`npm run build` runs `npx tsc` in every `plugins/*/` directory that has a `tsconfig.json`. The root `tsconfig.json` excludes `plugins/`, so each plugin compiles on its own.

The registry imports a local plugin (configured by path) from `<path>/dist/plugins/<directory name>/src/index.js`. The directory name must match the last segment of `package` in `plugins.json`. A plugin configured by npm package name is imported by that name, so Node resolves it through the package's `exports` or `main`.

Use a standalone `tsconfig.json` with `rootDir` at the repository root, so the entry point compiles to that path. Do not extend the root config: its `rootDir`, `include` and `exclude` compile the core instead of the plugin.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "rootDir": "../..",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

Set `"type": "module"` in the plugin's `package.json`, so Node loads the compiled ES module without a warning:

```json
{
  "name": "my-plugin",
  "type": "module"
}
```

### Migrations

Migration files are `.cjs` files (CommonJS) with a Knex migration interface. `npm run build` (or `npm run db:sync-plugins`) copies the `.cjs` files in `migrations/` of every enabled local plugin in `plugins.json` into `src/database/migrations/plugins/`. `npm run db:migrate` does not copy them, so run one of those first. A file name that already exists there with different content stops the sync.

```js
// 20260516_my_plugin_init.cjs
exports.up = async function(knex) {
  await knex.schema.createTable('my_plugin_data', (t) => {
    t.increments('id').primary();
    t.bigInteger('account_id').notNullable().index();
    t.string('amount', 64).notNullable();
    t.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('my_plugin_data');
};
```

Plugin migrations run in the same `npm run db:migrate` as the core migrations and share the core `knex_migrations` table. File names must be unique across the core and every plugin. Plugin tables land in schema `indexer` with the core tables, because the indexer's connections set `search_path` to `indexer`.

## Configuration

Plugins are configured in `plugins.json` at the project root:

```json
{
  "plugins": [
    {
      "package": "./plugins/my-plugin",
      "enabled": true,
      "startHeight": 12000000,
      "config": {
        "someKey": "someValue"
      }
    }
  ]
}
```

- `package` — local path (starts with `.` or `/`) or npm package name.
- `enabled` — only `true` plugins are loaded.
- `startHeight` — optional. When the plugin has no row in `indexer_plugin_state`, its watermark starts at `startHeight - 1`, so catch-up skips earlier momentums. Use it when adding a plugin to an indexer that is already past that height, to avoid replaying from genesis.
- `config` — passed to the plugin as `ctx.config`.

Override the config file path with `PLUGINS_CONFIG_PATH` env var.

### Indexer start height

Set `START_HEIGHT` in your `.env` to start indexing at momentum `START_HEIGHT + 1`. This only takes effect on a fresh database (when `last_indexed_momentum` is 0). If the indexer has already synced past this height, it continues normally from where it left off.

## Plugin lifecycle

1. **Loading** — at startup, `PluginRegistry` reads `plugins.json`, filters to enabled entries, and `import()`s each one.
2. **Initialization** — `plugin.init(ctx)` is called with the `PluginContext`. Use this to create tables, seed data, or open external connections. If the import or `init()` throws, the registry logs the error and skips the plugin until the next start. The indexer and the other plugins keep running.
3. **Catch-up** — at startup, before the indexer resumes, the registry replays the stored account blocks from the plugin's watermark plus one to the indexer's stored height. A new plugin starts at watermark 0 (or `startHeight - 1`), so without `startHeight` it replays everything indexed so far.
4. **Live dispatch** — every momentum the indexer commits, in historical batches and in real time, is dispatched after the core transaction commits. The indexer waits for every plugin before it indexes the next momentum.
5. **Shutdown** — `plugin.shutdown()` is called during graceful shutdown. Release resources here.

## Watermark / catch-up

Plugins automatically track their sync position in the core `indexer_plugin_state` table. The row is keyed by the plugin's `name`, so renaming a plugin starts it again from its initial watermark. On restart, any events between the plugin's last watermark and the current indexer height are replayed via the catch-up mechanism.

During live dispatch, each plugin gets one transaction per momentum: the momentum's account-block events in order, then `onMomentum`, then the watermark advances to that momentum's height. A plugin without `onMomentum` still advances. Plugins run in parallel, each in its own transaction.

Catch-up replays blocks by momentum height, in windows of 1000 momentums, ordered by momentum height then block id. `onMomentum` is not called during catch-up. Each window's events and its watermark run in one transaction.

If a handler throws, the plugin's transaction rolls back, so the momentum or window leaves no rows and the watermark stays at the last committed one. The error is logged, `shutdown()` runs, and the plugin receives no further events for the rest of the run. The indexer and other plugins keep running, and the next start replays the plugin from its watermark.

A plugin's rows and watermark commit together, so a restart replays only uncommitted work. A plugin should still apply each block idempotently: deleting its row from `indexer_plugin_state` and restarting replays it from `startHeight`, or from momentum 1 when `startHeight` is not set.

## Example: minimal plugin

```ts
// plugins/logger/src/index.ts
import type { ZenonIndexerPlugin, PluginContext, IndexedAccountBlockEvent } from '../../../src/plugins/types.js';

function createPlugin(): ZenonIndexerPlugin {
  let ctx: PluginContext;

  return {
    name: 'logger',

    async init(pluginCtx: PluginContext): Promise<void> {
      ctx = pluginCtx;
      ctx.log.info('logger plugin initialized');
    },

    async onAccountBlock(event: IndexedAccountBlockEvent): Promise<void> {
      ctx.log.info(`block ${event.hash} from ${event.fromAddress} to ${event.toAddress}`);
    },

    async shutdown(): Promise<void> {},
  };
}

export default createPlugin;
```

## Example: plugin with own tables

```ts
import type { Knex } from 'knex';
import type { PluginContext, IndexedAccountBlockEvent } from '../../../src/plugins/types.js';

async init(pluginCtx: PluginContext): Promise<void> {
  ctx = pluginCtx;
},

async onAccountBlock(event: IndexedAccountBlockEvent, tx: Knex.Transaction): Promise<void> {
  if (!event.tokenStandard) return;

  const account = await tx('nom_accounts')
    .where({ address: event.fromAddress })
    .select('id')
    .first();
  if (!account) return;

  await tx('my_transfers').insert({
    account_id: account.id,
    amount: event.amount,
    token_standard: event.tokenStandard,
    block_hash: event.hash,
  });
},
```

## Example: several writes per block

Every write through `tx` commits with the momentum's other writes and the watermark, or rolls back with them:

```ts
import type { Knex } from 'knex';
import type { IndexedAccountBlockEvent } from '../../../src/plugins/types.js';

async onAccountBlock(event: IndexedAccountBlockEvent, tx: Knex.Transaction): Promise<void> {
  const collection = await tx('my_collections')
    .where({ slug: event.decodedArgs?.slug })
    .first();
  if (!collection) return;

  await tx('my_items').insert({
    collection_id: collection.id,
    name: event.decodedArgs?.name,
  });
  await tx('my_collections')
    .where({ id: collection.id })
    .increment('minted', 1);
},
```

`tx.transaction()` opens a savepoint inside the registry's transaction, for a plugin that needs to roll back part of its own work.

## Tips

- **Keep handlers fast.** Plugin handlers run one block at a time. Heavy processing should be deferred or batched.
- **Use the Knex query builder.** Prefer `db('table').where(...)` over raw SQL. The builder handles parameterisation and prevents injection.
- **Write through `tx`.** A write through `ctx.db` commits on its own, ahead of the watermark, and a reader can see it above the watermark.
- **Handle missing data gracefully.** Not all blocks have `tokenStandard`, `contractMethod`, or `pairedBlockHash`. Always null-check.
- **Don't modify core tables.** Plugins should only write to their own tables. Read from core tables (e.g. `nom_accounts`) is fine.
