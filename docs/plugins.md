# Building Plugins

The indexer supports plugins that receive events as momentums and account blocks are indexed. Plugins can maintain their own database tables, perform custom indexing logic, and react to on-chain activity in real time.

## Overview

A plugin is a module that exports a factory function returning a `ZenonIndexerPlugin`. Plugins are loaded at startup based on `plugins.json` configuration. Each plugin:

- Receives a `PluginContext` during initialization with access to configuration, logging, and a database interface.
- Gets called for every account block indexed (`onAccountBlock`).
- Optionally gets called for every momentum (`onMomentum`).
- Can run cleanup logic on shutdown.

Events are delivered **after** the core transaction commits — plugin failures never roll back indexer state.

## Plugin interface

```ts
interface ZenonIndexerPlugin {
  readonly name: string;
  init(ctx: PluginContext): Promise<void>;
  onAccountBlock(event: IndexedAccountBlockEvent): Promise<void>;
  onMomentum?(momentum: IndexedMomentumEvent): Promise<void>;
  shutdown(): Promise<void>;
}
```

## PluginContext

```ts
interface PluginContext {
  config: Record<string, unknown>;  // from plugins.json
  log: PluginLogger;                // info/warn/error
  db: PluginDb;                     // Knex instance (+ legacy execute/query)
  databaseUrl: string;              // for external connections if needed
  genesisPath: string;              // path to genesis.json
}
```

The `db` interface is a full Knex instance. Use the query builder for all database operations:

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

## IndexedAccountBlockEvent

This is the event delivered to `onAccountBlock`. The data is built during the insert action — no extra DB lookups are needed by the plugin.

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
}
```

Key fields:

- `contractMethod` — set when the block calls a known embedded contract method. Contains `{ contractName, methodName }` (e.g. `"Stake Contract"`, `"Stake"`).
- `decodedArgs` — ABI-decoded arguments as an object. `null` for non-contract or unrecognised calls.
- `pairedBlockHash` — the hash of the send/receive pair. Use this to look up the other side of a transfer.
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

### `package.json`

Must have a `main` pointing to the compiled entry point:

```json
{
  "name": "my-plugin",
  "main": "dist/index.js"
}
```

### `tsconfig.json`

Extend the root config or set up standalone. Exclude from root `tsconfig.json` to keep builds independent.

### Migrations

Migration files are `.cjs` files (CommonJS) with a Knex migration interface. They're automatically synced into the core `src/database/migrations/plugins/` directory at build time.

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

Migrations use a shared `knex_migrations` table across all plugins. Filenames must be globally unique.

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
- `startHeight` — optional. If set, the plugin skips all blocks below this height during catch-up. Only applies on first run (when no watermark exists). Useful when adding a new plugin to an already-synced indexer — it avoids backfilling from genesis.
- `config` — passed to the plugin as `ctx.config`.

Override the config file path with `PLUGINS_CONFIG_PATH` env var.

### Indexer start height

Set `START_HEIGHT` in your `.env` to skip indexing below a specific momentum height. This only takes effect on a fresh database (when `last_indexed_momentum` is 0). If the indexer has already synced past this height, it continues normally from where it left off.

## Plugin lifecycle

1. **Loading** — at startup, `PluginRegistry` reads `plugins.json`, filters to enabled entries, and `import()`s each one.
2. **Initialization** — `plugin.init(ctx)` is called with the `PluginContext`. Use this to create tables, seed data, or open external connections.
3. **Catch-up** — if the plugin has a watermark (last processed height), the registry delivers any missed events between the watermark and the current indexer height.
4. **Real-time** — as new momentums are indexed, events are dispatched immediately after the core transaction commits.
5. **Shutdown** — `plugin.shutdown()` is called during graceful shutdown. Release resources here.

## Watermark / catch-up

Plugins automatically track their sync position in the core `indexer_plugin_state` table. On restart, any events between the plugin's last watermark and the current indexer height are replayed via the catch-up mechanism.

The watermark is updated after each batch of events is successfully processed. If a plugin throws during catch-up, the error is logged but doesn't stop the indexer.

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
async init(pluginCtx: PluginContext): Promise<void> {
  ctx = pluginCtx;
},

async onAccountBlock(event: IndexedAccountBlockEvent): Promise<void> {
  if (!event.tokenStandard) return;

  const account = await ctx.db('nom_accounts')
    .where({ address: event.fromAddress })
    .select('id')
    .first();
  if (!account) return;

  await ctx.db('my_transfers').insert({
    account_id: account.id,
    amount: event.amount,
    token_standard: event.tokenStandard,
    block_hash: event.hash,
  });
},
```

## Example: plugin with transactions

Use `db.transaction()` when multiple operations must succeed or fail atomically:

```ts
async onAccountBlock(event: IndexedAccountBlockEvent): Promise<void> {
  const collection = await ctx.db('my_collections')
    .where({ slug: event.decodedArgs?.slug })
    .first();
  if (!collection) return;

  await ctx.db.transaction(async (tx) => {
    await tx('my_items').insert({
      collection_id: collection.id,
      name: event.decodedArgs?.name,
    });
    await tx('my_collections')
      .where({ id: collection.id })
      .increment('minted', 1);
  });
},
```

## Tips

- **Keep handlers fast.** Plugin handlers run one block at a time. Heavy processing should be deferred or batched.
- **Use the Knex query builder.** Prefer `db('table').where(...)` over raw SQL. The builder handles parameterisation and prevents injection.
- **Use transactions for multi-step writes.** When multiple inserts/updates must be atomic, wrap them in `db.transaction(async (tx) => { ... })`.
- **Handle missing data gracefully.** Not all blocks have `tokenStandard`, `contractMethod`, or `pairedBlockHash`. Always null-check.
- **Don't modify core tables.** Plugins should only write to their own tables. Read from core tables (e.g. `nom_accounts`) is fine.
