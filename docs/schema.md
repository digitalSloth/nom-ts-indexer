# Database Schema

Every table lives in schema `indexer` (`INDEXER_SCHEMA` in `src/database/schema.ts`): the 40 core tables, plugin tables and the Knex migration tables. Both Knex connections set `search_path` to `indexer`, so code and migrations use unqualified table names. Each migration in `src/database/migrations/` creates the tables of one domain, and the migrations run in foreign key order.

## Tables by domain

| Migration | Tables |
|-----------|--------|
| `00000001_create_accounts` | `nom_accounts` |
| `00000002_create_tokens` | `nom_tokens`, `nom_account_tokens` |
| `00000003_create_pillars` | `nom_pillars`, `nom_pillar_update_histories`, `nom_delegations`, `nom_legacy_pillar_entries`, `nom_qsr_deposits` (QSR deposited towards a pillar or a sentinel) |
| `00000004_create_sentinels` | `nom_sentinels` |
| `00000005_create_contracts` | `nom_contracts`, `nom_contract_methods` |
| `00000006_create_momentums_and_account_blocks` | `nom_momentums`, `nom_account_blocks`, `nom_account_block_data` |
| `00000007_create_token_mints_burns_and_rewards` | `nom_token_mints`, `nom_token_burns`, `nom_account_rewards` |
| `00000008_create_stakes_and_plasma` | `nom_stakes` (also liquidity stakes), `nom_plasma` |
| `00000009_create_accelerator` | `nom_accelerator_projects`, `nom_accelerator_phases`, `nom_votes` |
| `00000010_create_bridge` | `nom_bridge_admins`, `nom_bridge_guardians`, `nom_bridge_networks`, `nom_bridge_network_tokens`, `nom_bridge_wraps`, `nom_bridge_unwraps`, `nom_bridge_settings` |
| `00000011_create_liquidity` | `nom_liquidity_admins`, `nom_liquidity_guardians`, `nom_liquidity_settings`, `nom_liquidity_token_tuples` |
| `00000012_create_time_challenges` | `nom_time_challenges`, shared by the bridge and liquidity contracts |
| `00000013_create_timelocks` | `nom_htlcs`, `nom_ptlcs` |
| `00000014_create_sporks_and_swap_entries` | `nom_sporks`, `nom_swap_entries` |
| `00000015_create_indexer_state` | `indexer_state`, `indexer_plugin_state` |

`nom_account_blocks` references `nom_tokens`, and the mint, burn and reward tables reference `nom_account_blocks`, so the token tables are created in two migrations.

## Column order

Every table orders its columns by type, and a new table follows the same order:

1. `id`
2. Foreign ids: columns with a foreign key or ending in `_id`, such as `nom_votes.votable_id`
3. Integers and decimals
4. Strings
5. Text
6. JSON
7. Booleans
8. Timestamps

Within a group, columns keep the order of the create migration. Indexes follow the columns.

## Storage conventions

- **Ids** are serial integers. They change on every `npm run reset`, so anything that stores indexer data must key it by address, hash and token standard.
- **Token amounts** are decimal strings in base units (ZNN and QSR have 8 decimals), for example `nom_account_blocks.amount`, `nom_account_tokens.balance` and `nom_tokens.total_supply`. Sort by amount with a cast: `nom_account_tokens` has an index on `(token_id, (balance::numeric) DESC)`. The accelerator `znn_*` and `qsr_*` amount columns are `bigint`.
- **Hashes** of blocks and momentums are stored as hex strings. Hash and bytes values that handlers copy from contract arguments, such as `nom_htlcs.hash_lock`, are lower-case hex without `0x`.
- **Block data**: `nom_account_block_data.raw` is the block data in base64. `decoded` is JSON text of the ABI-decoded arguments, with integers over 48 bits as decimal strings and smaller ones as numbers. Data that is not a contract call but parses as a JSON object is stored in `decoded` as is. `nom_momentums.data` is base64.
- **Times** are `timestamptz`. A block's `created_at` is the time of the momentum that confirmed it. Contract expiry times are clamped to 9999-12-31T23:59:59Z.

## Account blocks

`nom_account_blocks` holds every account block. The columns that need explaining:

| Column | Meaning |
|--------|---------|
| `block_type` | `1` genesis receive, `2` user send, `3` user receive, `4` contract send, `5` contract receive |
| `momentum_id` | The momentum that confirmed the block |
| `momentum_acknowledged_id` | The momentum the block acknowledged. Handlers read it as the contract's frontier |
| `paired_account_block_id` | Links a send and its receive, in both directions. Set when the second of the two is indexed |
| `parent_id` | Set on the sends a contract receive produced (its descendants) |
| `contract_method_id` | Set on a send whose first 4 data bytes match a method of the receiving contract |
| `call_status` | Contract receives only: `1` the call succeeded, `2` it failed and the chain rolled it back |
| `call_failed` | `true` on the send of a failed contract call, so lists of failed calls need no join. Partial indexes serve those lists |

`nom_contract_methods` holds one row per embedded contract ABI function, with its `name`, `signature` and `fingerprint` (the first 4 data bytes as hex). `db:seed` creates these rows, and each indexer start adds the methods a newer SDK defines. See [contributing.md](contributing.md#adding-a-contract-method-handler).

## Balances and rewards

- `nom_account_tokens` holds each account's balance per token, plus lifetime `sent` and `received` totals. Genesis balances count as received, so `balance = received - sent`. The token contract also receives the supply it issues or mints, before it sends it out, and sends the tokens it burns.
- `nom_account_rewards` holds one row per reward: `pillar`, `delegate`, `stake`, `sentinel` and `liquidity` from reward mints, `liquidity_program` from QSR sent by the liquidity program distributor, and `bridge_affiliate` from redeemed unwraps with a log index above 4,000,000,000. Each row is written in the same transaction as the block that produces it.

## Contract state

- `nom_votes` is polymorphic: `votable_type` is `AcceleratorProject` or `AcceleratorPhase`.
- `nom_htlcs` holds one row per hashed timelock, keyed by the `Create` send hash. `preimage` is set once it is unlocked. HTLCs that share a `hash_lock` belong to the same swap.
- `nom_ptlcs` holds one row per point timelock, keyed by the `Create` send hash. `signature` is set at unlock and `reclaim_signature` by `ReclaimWithSignature`. PTLCs of point type 2 that share a `point_lock` unlock with the same scalar. The contract's ABI is the local `PtlcContract` (`src/constants/ptlc-contract.ts`), because the SDK has none.
- `nom_sporks`, `nom_swap_entries`, `nom_legacy_pillar_entries` and `nom_qsr_deposits` mirror contract state: network upgrades, legacy swap balances and their retrievals, legacy pillar slots, and QSR deposited towards a pillar or sentinel.
- `nom_bridge_settings` and `nom_liquidity_settings` each hold one row with the contract's current settings.
- `nom_bridge_networks.total_znn_*` and `total_qsr_*` are decimal strings, `NULL` until the network's first ZNN or QSR transfer. A wrap adds to `*_wrapped` and `*_held` when it is made. An unwrap adds to `*_unwrapped` and subtracts from `*_held` when it is redeemed, affiliate reward unwraps included, so `*_held` is what the bridge still holds for the network. A revoke changes neither total: an unredeemed request can no longer be redeemed, and the contract also accepts revoking a request already redeemed.
- `nom_bridge_unwraps.updated_at` is the time of the request, its redemption or its revocation, whichever came last.
- `nom_time_challenges` holds one row per pending or answered admin challenge. `created_at` is the time of the call that started the current challenge, and a call with other parameters restarts it. `expires_at` is the time of the first momentum after `end_height`, from which the change can be applied. It is `null` until that momentum is indexed.
- `nom_tokens.initial_supply` and `created_at` are `null` for a token the indexer loaded from the node before indexing its `IssueToken`, which happens only when indexing started above the issue height.

## Pillar metrics

The indexer maintains these `nom_pillars` columns from indexed blocks and momentums, with the meaning the node's `embedded.pillar.getAll` gives them:

| Column | Meaning |
|--------|---------|
| `weight` | Summed ZNN balance of the accounts delegating to the pillar, as a decimal string. `0` once revoked |
| `rank` | 0-based position among active pillars by weight descending, then by name in byte order. A revoked pillar keeps its last rank |
| `produced_momentums` | Momentums the pillar produced in the current epoch. Epochs are 24 h, counted from the genesis time |
| `total_momentums_produced` | Momentums the pillar has produced in total |
| `az_engagement` | Percentage of Accelerator-Z projects and phases created while the pillar was active (from registration until revocation) that it voted on, rounded to 1 decimal. `null` until such an item exists |
| `az_avg_vote_time` | Mean seconds between an item's creation and the pillar's vote on it, over all its votes. A changed vote counts from its latest time |

A database indexed from above momentum 1 counts production only from where it started.

## Indexer state

- `indexer_state` holds one row: `last_indexed_momentum`, `is_running`, `seeded_at` and `updated_at`. See [indexer.md](indexer.md#resume-point).
- `indexer_plugin_state` holds one row per plugin, keyed by `name`, with its `watermark`. See [plugins.md](plugins.md#watermark--catch-up).
