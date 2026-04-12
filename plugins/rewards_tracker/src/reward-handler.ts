import {
  PILLAR_ADDRESS,
  STAKE_ADDRESS,
  SENTINEL_ADDRESS,
  LIQUIDITY_ADDRESS,
  ZNN_ZTS,
  QSR_ZTS,
} from 'znn-typescript-sdk';
import type { IndexedAccountBlockEvent, PluginDb } from '../../../src/plugins/types.js';

const PILLAR = PILLAR_ADDRESS.toString();
const STAKE = STAKE_ADDRESS.toString();
const SENTINEL = SENTINEL_ADDRESS.toString();
const LIQUIDITY = LIQUIDITY_ADDRESS.toString();

const ZNN_TOKEN_STANDARD = ZNN_ZTS.toString();
const QSR_TOKEN_STANDARD = QSR_ZTS.toString();

const REWARD_TYPES: Record<string, string> = {
  [PILLAR]: 'pillar',   // resolved to pillar/delegate below
  [STAKE]: 'stake',
  [SENTINEL]: 'sentinel',
  [LIQUIDITY]: 'liquidity',
};

export async function handleReward(
  event: IndexedAccountBlockEvent,
  db: PluginDb,
): Promise<void> {
  // Look up the mint record created by the core indexer's token/mint handler
  const mints = await db.query<{ issuer_id: number; receiver_id: number }>(
    'SELECT issuer_id, receiver_id FROM nom_token_mints WHERE account_block_id = $1',
    event.accountBlockId,
  );
  const mint = mints[0];
  if (!mint) return;

  // Resolve issuer address
  const issuerRows = await db.query<{ address: string }>(
    'SELECT address FROM nom_accounts WHERE id = $1',
    mint.issuer_id,
  );
  const issuerAddress = issuerRows[0]?.address;
  if (!issuerAddress) return;

  const baseType = REWARD_TYPES[issuerAddress];
  if (!baseType) return; // not a reward pool

  // Skip liquidity rewards sent to the liquidity contract itself
  if (issuerAddress === LIQUIDITY && mint.receiver_id === mint.issuer_id) return;

  // Resolve reward type — pillar vs delegate
  let rewardType = baseType;
  if (baseType === 'pillar') {
    const isPillar = await isPillarWithdrawAddress(db, mint.receiver_id);
    rewardType = isPillar ? 'pillar' : 'delegate';
  }

  // Get token ID
  if (!event.tokenStandard) return;
  const tokenRows = await db.query<{ id: number }>(
    'SELECT id FROM nom_tokens WHERE token_standard = $1',
    event.tokenStandard,
  );
  const tokenId = tokenRows[0]?.id;
  if (tokenId == null) return;

  // Insert reward record (idempotent via UNIQUE on account_block_id)
  await db.execute(
    `INSERT INTO rewards_tracker_rewards (account_id, token_id, account_block_id, type, amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_block_id) DO NOTHING`,
    mint.receiver_id,
    tokenId,
    event.accountBlockId,
    rewardType,
    event.amount,
    new Date(event.momentum.timestamp * 1000),
  );

  // Update aggregate rewards on nom_accounts
  if (event.tokenStandard === ZNN_TOKEN_STANDARD) {
    await db.execute(
      `UPDATE nom_accounts SET znn_rewards = (COALESCE(znn_rewards, '0')::numeric + $1::numeric)::text WHERE id = $2`,
      event.amount,
      mint.receiver_id,
    );
  } else if (event.tokenStandard === QSR_TOKEN_STANDARD) {
    await db.execute(
      `UPDATE nom_accounts SET qsr_rewards = (COALESCE(qsr_rewards, '0')::numeric + $1::numeric)::text WHERE id = $2`,
      event.amount,
      mint.receiver_id,
    );
  }
}

async function isPillarWithdrawAddress(db: PluginDb, accountId: number): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    'SELECT id FROM nom_pillars WHERE withdraw_account_id = $1 LIMIT 1',
    accountId,
  );
  return rows.length > 0;
}
