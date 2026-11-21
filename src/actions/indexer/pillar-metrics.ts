import { tokenRegistry } from '../../services/registries/token-registry.js';
import { ZNN_TOKEN_STANDARD } from '../../constants/zenon.js';
import { genesisTimestamp, readGenesis } from '../../database/seeders/genesis/genesis-file.js';

/**
 * Pillar metrics the indexer derives from the chain, matching what the
 * node's `embedded.pillar.getAll` reports:
 *
 * - `weight`: the summed ZNN balance of the accounts delegating to an
 *   active pillar.
 * - `rank`: 0-based position of an active pillar by weight descending,
 *   then by name in byte order.
 * - `produced_momentums`: momentums produced in the current 24 h epoch,
 *   counted from the genesis time. `total_momentums_produced` counts all.
 * - `az_engagement`, `az_avg_vote_time`: Accelerator-Z voting share and
 *   average vote delay.
 */

const EPOCH_MS = 24 * 60 * 60 * 1000;

/** A pillar's votes joined to the project or phase each one is for. */
const VOTE_ITEMS = `
  nom_votes v
  JOIN LATERAL (
    SELECT created_at FROM nom_accelerator_projects
    WHERE v.votable_type = 'AcceleratorProject' AND id = v.votable_id
    UNION ALL
    SELECT created_at FROM nom_accelerator_phases
    WHERE v.votable_type = 'AcceleratorPhase' AND id = v.votable_id
  ) item ON true
  WHERE v.pillar_id = pl.id`;

/** An item created while the pillar `pl` was active. */
const WHILE_ACTIVE = `item.created_at >= pl.created_at
  AND (pl.revoked_at IS NULL OR item.created_at < pl.revoked_at)`;

const ranksDirty = new WeakSet<object>();

let genesisMs: Promise<number> | undefined;
let lastMomentum: { height: bigint; epoch: number } | undefined;

/** Flags the transaction so its momentum recomputes pillar ranks. */
export function markPillarRanksDirty(tx: object): void {
  ranksDirty.add(tx);
}

/**
 * Recomputes the rank of every active pillar when a weight, registration or
 * revocation in this transaction may have changed the order.
 */
export async function refreshPillarRanks(tx: any): Promise<void> {
  if (!ranksDirty.has(tx)) return;
  ranksDirty.delete(tx);

  await tx.raw(`
    UPDATE nom_pillars p
    SET rank = r.rank
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY weight::numeric DESC, name COLLATE "C") - 1 AS rank
      FROM nom_pillars
      WHERE revoked_at IS NULL
    ) r
    WHERE p.id = r.id AND p.rank <> r.rank
  `);
}

/** Adds `delta` to an active pillar's weight. A revoked pillar keeps 0. */
export async function addPillarWeight(tx: any, pillarId: number, delta: bigint): Promise<void> {
  if (delta === 0n) return;
  await tx('nom_pillars')
    .where({ id: pillarId, revoked_at: null })
    .update({ weight: tx.raw('(weight::numeric + ?::numeric)::text', [delta.toString()]) });
  markPillarRanksDirty(tx);
}

/** The account's ZNN balance, 0 when it holds none. */
export async function znnBalance(tx: any, accountId: number): Promise<bigint> {
  const znnId = tokenRegistry.get(ZNN_TOKEN_STANDARD);
  if (znnId === undefined) return 0n;
  const row = await tx('nom_account_tokens')
    .where({ account_id: accountId, token_id: znnId })
    .select('balance')
    .first();
  return BigInt(row?.balance ?? 0);
}

/**
 * Moves a ZNN balance change of a delegating account into its pillar's
 * weight. The ZNN token id is cached by the token registry from the first
 * block that carries ZNN, so every ZNN balance change after that matches.
 */
export async function applyDelegatorBalanceChange(
  tx: any,
  accountId: number,
  tokenId: number,
  delta: bigint,
): Promise<void> {
  if (delta === 0n || tokenRegistry.get(ZNN_TOKEN_STANDARD) !== tokenId) return;
  const delegation = await tx('nom_delegations')
    .where({ account_id: accountId, ended_at: null })
    .select('pillar_id')
    .first();
  if (delegation) {
    await addPillarWeight(tx, delegation.pillar_id, delta);
  }
}

async function epochOf(createdAt: Date): Promise<number> {
  genesisMs ??= readGenesis<{ GenesisTimestampSec: number }>().then((g) =>
    genesisTimestamp(g).getTime(),
  );
  return Math.floor((createdAt.getTime() - (await genesisMs)) / EPOCH_MS);
}

/**
 * Counts a momentum towards its producer pillar. The first momentum of a
 * new epoch resets every pillar's `produced_momentums`.
 */
export async function recordPillarProduction(
  tx: any,
  pillarId: number | null,
  height: bigint,
  createdAt: Date,
): Promise<void> {
  const epoch = await epochOf(createdAt);

  let previousEpoch: number | undefined;
  if (lastMomentum?.height === height - 1n) {
    previousEpoch = lastMomentum.epoch;
  } else {
    const previous = await tx('nom_momentums')
      .where({ height: height - 1n })
      .select('created_at')
      .first();
    if (previous) previousEpoch = await epochOf(new Date(previous.created_at));
  }
  // Keyed by height, so a rolled-back momentum that is indexed again reads
  // its predecessor from the database instead of from this cache.
  lastMomentum = { height, epoch };

  // Without the previous momentum (indexing started above it) there is no
  // epoch to close.
  if (previousEpoch !== undefined && previousEpoch !== epoch) {
    await tx('nom_pillars').where('produced_momentums', '<>', 0).update({ produced_momentums: 0 });
  }

  if (pillarId !== null) {
    await tx('nom_pillars')
      .where({ id: pillarId })
      .update({
        produced_momentums: tx.raw('produced_momentums + 1'),
        total_momentums_produced: tx.raw('total_momentums_produced + 1'),
      });
  }
}

/**
 * Recomputes Accelerator-Z engagement for the given pillars, or for every
 * active pillar when `pillarIds` is omitted. Engagement is the share of
 * projects and phases created while the pillar was active (from its
 * registration until its revocation) that it voted on, capped at 100 and
 * rounded to 1 decimal. The average vote time is the
 * mean delay in seconds between an item's creation and the pillar's vote,
 * over all its votes. A pillar with no items since it registered keeps
 * its values.
 */
export async function refreshPillarEngagement(tx: any, pillarIds?: number[]): Promise<void> {
  const filter = pillarIds ? 'pl.id = ANY(?)' : 'pl.revoked_at IS NULL';
  const bindings = pillarIds ? [pillarIds] : [];

  await tx.raw(
    `
    UPDATE nom_pillars p
    SET az_engagement = ROUND(LEAST(s.voted, s.total) * 100.0 / s.total, 1),
        az_avg_vote_time = s.avg_vote_time
    FROM (
      SELECT pl.id,
        (SELECT COUNT(*) FROM nom_accelerator_projects item WHERE ${WHILE_ACTIVE})
          + (SELECT COUNT(*) FROM nom_accelerator_phases item WHERE ${WHILE_ACTIVE}) AS total,
        (SELECT COUNT(*) FILTER (WHERE ${WHILE_ACTIVE}) FROM ${VOTE_ITEMS}) AS voted,
        (SELECT ROUND(AVG(EXTRACT(EPOCH FROM v.created_at - item.created_at))) FROM ${VOTE_ITEMS})
          AS avg_vote_time
      FROM nom_pillars pl
      WHERE ${filter}
    ) s
    WHERE p.id = s.id AND s.total > 0
  `,
    bindings,
  );
}
