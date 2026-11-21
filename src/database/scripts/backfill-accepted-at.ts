import knex from 'knex';
import type { Knex } from 'knex';
import { parseArgs } from 'node:util';
import { AcceleratorProjectStatus, AcceleratorProjectVote } from 'znn-typescript-sdk';
import knexConfig from '../knexfile.js';
import { CALL_STATUS_SUCCESS } from '../../actions/indexer/contract-call-status.js';
import { isQuorumReached, isVotingOpen } from '../../actions/process/accelerator/update.js';
import { bareHex } from '../../actions/process/htlc/hex.js';

/** A pillar registration, active from its registration until its revocation. */
export interface PillarTerm {
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * A successful Accelerator call that can change whether a project passes,
 * in the order the contract received it.
 */
export type AcceleratorCall =
  | { kind: 'vote'; itemHash: string; pillarName: string; vote: number }
  | { kind: 'update'; frontier: Date };

export interface ReplayProject {
  id: number;
  hash: string;
  createdAt: Date;
}

const isActiveAt = (pillar: PillarTerm, at: Date): boolean =>
  pillar.createdAt <= at && (pillar.revokedAt === null || pillar.revokedAt > at);

/**
 * Replays votes and updates in the order the contract received them, and
 * returns when each project passed: the frontier momentum time of the
 * first update that found it inside its voting period with enough votes.
 * Every update runs that check against the pillars active at its frontier
 * momentum, as the live update handler does.
 */
export function replayAcceptance(
  projects: ReplayProject[],
  calls: AcceleratorCall[],
  pillars: PillarTerm[],
): Map<number, Date> {
  const pending = new Map(projects.map((p) => [p.hash, p]));
  // Votes per project hash, keyed by pillar name as the contract stores them.
  const votes = new Map<string, Map<string, number>>();
  const accepted = new Map<number, Date>();

  for (const call of calls) {
    if (pending.size === 0) break;

    if (call.kind === 'vote') {
      if (!pending.has(call.itemHash)) continue;
      const byPillar = votes.get(call.itemHash) ?? new Map<string, number>();
      byPillar.set(call.pillarName, call.vote);
      votes.set(call.itemHash, byPillar);
      continue;
    }

    if (votes.size === 0) continue;
    const numPillars = pillars.filter((p) => isActiveAt(p, call.frontier)).length;

    for (const [hash, byPillar] of votes) {
      const project = pending.get(hash)!;
      if (!isVotingOpen(project.createdAt, call.frontier)) {
        pending.delete(hash);
        votes.delete(hash);
        continue;
      }
      const values = [...byPillar.values()];
      const tally = {
        total_votes: values.length,
        total_yes_votes: values.filter((v) => v === AcceleratorProjectVote.yes).length,
        total_no_votes: values.filter((v) => v === AcceleratorProjectVote.no).length,
      };
      if (isQuorumReached(tally, numPillars)) {
        accepted.set(project.id, call.frontier);
        pending.delete(hash);
        votes.delete(hash);
      }
    }
  }

  return accepted;
}

interface PillarRow extends PillarTerm {
  id: number;
  name: string;
  producerAccountId: number;
}

/**
 * Loads every successful vote and update the Accelerator contract
 * received, in its account chain order. A vote by producer address names
 * the pillar whose producer it was at the vote's frontier momentum.
 */
async function loadCalls(db: Knex, pillars: PillarRow[]): Promise<AcceleratorCall[]> {
  const pillarById = new Map(pillars.map((p) => [p.id, p]));
  const pillarsByProducer = new Map<number, Set<PillarRow>>();
  const addProducer = (accountId: number, pillar: PillarRow) => {
    const set = pillarsByProducer.get(accountId) ?? new Set<PillarRow>();
    set.add(pillar);
    pillarsByProducer.set(accountId, set);
  };

  for (const pillar of pillars) {
    addProducer(pillar.producerAccountId, pillar);
  }
  const histories = await db('nom_pillar_update_histories').select(
    'pillar_id',
    'producer_account_id',
  );
  for (const row of histories) {
    addProducer(row.producer_account_id, pillarById.get(row.pillar_id)!);
  }

  const rows = await db('nom_account_blocks as r')
    .join('nom_account_blocks as s', 's.id', 'r.paired_account_block_id')
    .join('nom_contract_methods as cm', 'cm.id', 's.contract_method_id')
    .join('nom_contracts as c', 'c.id', 'cm.contract_id')
    .leftJoin('nom_momentums as ack', 'ack.id', 'r.momentum_acknowledged_id')
    .leftJoin('nom_account_block_data as d', 'd.account_block_id', 's.id')
    .where('c.name', 'Accelerator Contract')
    .where('r.account_id', db.ref('c.account_id'))
    .where('r.call_status', CALL_STATUS_SUCCESS)
    .whereIn('cm.name', ['VoteByName', 'VoteByProdAddress', 'Update'])
    .orderBy('r.height')
    .select('r.hash', 'cm.name as method', 's.account_id as sender_id', 'd.decoded', {
      frontier: 'ack.created_at',
    });

  return rows.map((row): AcceleratorCall => {
    if (row.frontier === null) {
      throw new Error(`Acknowledged momentum not found for contract receive ${row.hash}`);
    }
    const frontier = new Date(row.frontier);
    if (row.method === 'Update') {
      return { kind: 'update', frontier };
    }

    if (!row.decoded) {
      throw new Error(`${row.method} receive ${row.hash} has no decoded data`);
    }
    const decoded = JSON.parse(row.decoded);
    let pillarName: string = decoded.name;
    if (row.method === 'VoteByProdAddress') {
      const names = new Set(
        [...(pillarsByProducer.get(row.sender_id) ?? [])]
          .filter((p) => isActiveAt(p, frontier))
          .map((p) => p.name),
      );
      if (names.size !== 1) {
        throw new Error(
          `VoteByProdAddress receive ${row.hash}: expected one active pillar for producer account ${row.sender_id}, found ${names.size}`,
        );
      }
      [pillarName] = names;
    }
    return {
      kind: 'vote',
      itemHash: bareHex(decoded.id),
      pillarName,
      vote: Number(decoded.vote),
    };
  });
}

export interface BackfillProject {
  id: number;
  hash: string;
  name: string;
  acceptedAt: Date;
}

export interface BackfillReport {
  /** Accepted projects with no acceptance time, and the time the replay found. */
  filled: BackfillProject[];
  /** Projects whose replay disagrees with their status: never passing while accepted, or passing while closed. */
  mismatches: { id: number; hash: string; name: string; status: number }[];
  written: boolean;
}

const ACCEPTED = [AcceleratorProjectStatus.active, AcceleratorProjectStatus.completed];

/**
 * Fills accepted_at for accepted projects indexed before it was recorded.
 * Closed projects are replayed too, as a check: none may pass. Writes only
 * when the replay agrees with every project's status, and only into
 * accepted_at values that are still empty.
 */
export async function backfillAcceptedAt(
  db: Knex,
  options: { write: boolean },
): Promise<BackfillReport> {
  const projects = await db('nom_accelerator_projects')
    .whereNull('accepted_at')
    .whereIn('status', [...ACCEPTED, AcceleratorProjectStatus.closed])
    .orderBy('id')
    .select('id', 'hash', 'name', 'status', 'created_at');

  const pillarRows = await db('nom_pillars').select(
    'id',
    'name',
    'producer_account_id',
    'created_at',
    'revoked_at',
  );
  const pillars: PillarRow[] = pillarRows.map((row) => ({
    id: row.id,
    name: row.name,
    producerAccountId: row.producer_account_id,
    createdAt: new Date(row.created_at),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
  }));

  const accepted = replayAcceptance(
    projects.map((p) => ({ id: p.id, hash: p.hash, createdAt: new Date(p.created_at) })),
    await loadCalls(db, pillars),
    pillars,
  );

  const filled: BackfillProject[] = [];
  const mismatches: BackfillReport['mismatches'] = [];
  for (const project of projects) {
    const acceptedAt = accepted.get(project.id);
    const isAccepted = ACCEPTED.includes(project.status);
    if (isAccepted !== (acceptedAt !== undefined)) {
      mismatches.push({
        id: project.id,
        hash: project.hash,
        name: project.name,
        status: project.status,
      });
    } else if (acceptedAt !== undefined) {
      filled.push({ id: project.id, hash: project.hash, name: project.name, acceptedAt });
    }
  }

  const write = options.write && mismatches.length === 0 && filled.length > 0;
  if (write) {
    await db.transaction(async (tx) => {
      for (const project of filled) {
        await tx('nom_accelerator_projects')
          .where({ id: project.id })
          .whereNull('accepted_at')
          .update({ accepted_at: project.acceptedAt });
      }
    });
  }

  return { filled, mismatches, written: write };
}

async function main() {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } });
  const db = knex(knexConfig);

  try {
    const report = await backfillAcceptedAt(db, { write: !values['dry-run'] });

    for (const project of report.filled) {
      console.log(`${project.acceptedAt.toISOString()}  ${project.hash}  ${project.name}`);
    }
    for (const project of report.mismatches) {
      console.error(
        `✗ replay disagrees with status ${project.status}: ${project.hash}  ${project.name}`,
      );
    }

    if (report.mismatches.length > 0) {
      console.error(`✗ ${report.mismatches.length} mismatches, nothing written`);
      process.exitCode = 1;
    } else if (report.written) {
      console.log(`✓ accepted_at filled for ${report.filled.length} projects`);
    } else {
      console.log(`✓ ${report.filled.length} projects to fill, nothing written`);
    }
  } finally {
    await db.destroy();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('db:backfill-accepted-at failed:', err.message);
    process.exit(1);
  });
}
