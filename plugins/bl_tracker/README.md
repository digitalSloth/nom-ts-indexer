# Balance Tracker Plugin

The `bl_tracker` plugin tracks ZNN and QSR balance changes for every account in the network. It maintains a `bl_tracker_balances` table with current balances, sent/received totals, staked amounts, plasma fused, and genesis balances.

## What it tracks

| Column | Description |
|--------|-------------|
| `znn_balance` | Current ZNN balance (increments on receive, decrements on send) |
| `qsr_balance` | Current QSR balance |
| `znn_sent` | Total ZNN sent |
| `znn_received` | Total ZNN received |
| `qsr_sent` | Total QSR sent |
| `qsr_received` | Total QSR received |
| `znn_staked` | Net ZNN staked (incremented by Stake, decremented by Cancel) |
| `qsr_fused` | Net QSR fused (incremented by Fuse, decremented by CancelFuse) |
| `plasma_amount` | Net plasma generated |
| `genesis_znn_balance` | ZNN balance from genesis |
| `genesis_qsr_balance` | QSR balance from genesis |

## How it works

### Genesis seeding

On first initialization, if the `bl_tracker_balances` table is empty, the plugin reads `genesis.json` and seeds starting balances for every account that had ZNN or QSR at genesis. Both `znn_balance` and `znn_received` are set to the genesis amount — genesis balances count as received.

### Block processing

Every account block passes through `handleBlock(event, db)`. The handler routes based on `contractMethod`:

| Contract method | Handler | Effect |
|----------------|---------|--------|
| Stake Contract / Stake | `handleStake` | `znn_staked += amount` |
| Stake Contract / Cancel | `handleCancelStake` | `znn_staked -= original_amount` |
| Plasma Contract / Fuse | `handleFuse` | `qsr_fused += amount` (fuser), `plasma_amount += amount` (recipient) |
| Plasma Contract / CancelFuse | `handleCancelFuse` | `qsr_fused -= amount`, `plasma_amount -= amount` |
| *(any other)* | `handleTransfer` | Sender debit + receiver credit |

### Transfer handling

Transfers are processed from both sides:

**Sender side** (UserSend / ContractSend):
- Skips blocks from the burn address, with zero amount, or non-ZNN/QSR tokens.
- Skips sends from the token contract address (minting).
- Debits `znn_balance` / `qsr_balance` and increments `znn_sent` / `qsr_sent`.

**Receiver side** (UserReceive / ContractReceive):
- Looks up the paired send block to get the actual amount and token (receive blocks carry amount=0).
- Skips if no paired block, zero amount, or non-ZNN/QSR token.
- For `UserReceive`: the receiver is `event.fromAddress` (the burn address in the event is the protocol, not the actual recipient).
- For `ContractReceive`: the receiver is `event.toAddress`.
- Credits `znn_balance` / `qsr_balance` and increments `znn_received` / `qsr_received`.

### Staking

`handleStake` — credits `znn_staked` for the sender.

`handleCancelStake` — finds the original stake block via `decodedArgs.id`, debits `znn_staked` for the original staker.

### Plasma

`handleFuse` — credits `qsr_fused` for the fuser and `plasma_amount` for the recipient (the address receiving the plasma).

`handleCancelFuse` — finds the original fuse block via `decodedArgs.id`, debits both `qsr_fused` and `plasma_amount`.

## Database schema

```sql
CREATE TABLE bl_tracker_balances (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL UNIQUE,
  znn_balance TEXT NOT NULL DEFAULT '0',
  qsr_balance TEXT NOT NULL DEFAULT '0',
  znn_sent TEXT NOT NULL DEFAULT '0',
  znn_received TEXT NOT NULL DEFAULT '0',
  qsr_sent TEXT NOT NULL DEFAULT '0',
  qsr_received TEXT NOT NULL DEFAULT '0',
  znn_staked TEXT NOT NULL DEFAULT '0',
  qsr_fused TEXT NOT NULL DEFAULT '0',
  plasma_amount TEXT NOT NULL DEFAULT '0',
  genesis_znn_balance TEXT NOT NULL DEFAULT '0',
  genesis_qsr_balance TEXT NOT NULL DEFAULT '0',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

All balance columns are `TEXT` storing decimal strings. Updates use numeric arithmetic:

```sql
INSERT INTO bl_tracker_balances (account_id, znn_balance, znn_sent, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (account_id) DO UPDATE SET
  znn_balance = (bl_tracker_balances.znn_balance::numeric + EXCLUDED.znn_balance::numeric)::text,
  znn_sent = (bl_tracker_balances.znn_sent::numeric + EXCLUDED.znn_sent::numeric)::text,
  updated_at = NOW()
```

This is PostgreSQL-specific (`::numeric` cast). The plugin targets PostgreSQL only.

## Project structure

```
plugins/bl_tracker/
├── package.json
├── tsconfig.json
├── migrations/
│   └── 20260515_bl_tracker_init.cjs
├── src/
│   ├── index.ts              # plugin factory
│   ├── balance-handler.ts    # all block processing logic
│   └── genesis.ts            # genesis balance seeding
└── tests/
    └── balance-handler.test.ts
```

## Testing

Tests use Vitest with a mock `PluginDb`:

```ts
function makeDb(): MockDb {
  const calls: string[] = [];
  let queryResult: unknown[] = [];
  return {
    calls,
    setQueryResult(rows: unknown[]) { queryResult = rows; },
    execute: vi.fn(async (sql: string) => { calls.push(sql); }),
    query: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('nom_accounts') && !sql.includes('nom_account_blocks')) {
        const id = ACCOUNT_MAP[params[0] as string];
        return id != null ? [{ id }] : [];
      }
      return queryResult;
    }),
  };
}
```

The mock routes by SQL shape — account lookups return from a predefined map, everything else returns from `queryResult` (set per test for paired block lookups).

Run tests: `npx vitest run plugins/bl_tracker/tests/`
