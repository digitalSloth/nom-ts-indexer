import type { IndexedAccountBlockEvent, PluginDb } from '../../../src/plugins/types.js';
import { ZNN_ZTS, QSR_ZTS, EMPTY_ADDRESS, TOKEN_ADDRESS, BlockTypeEnum } from 'znn-typescript-sdk';

const ZNN_TOKEN_STANDARD = ZNN_ZTS.toString();
const QSR_TOKEN_STANDARD = QSR_ZTS.toString();

const BURN_ADDRESS = EMPTY_ADDRESS.toString();
const SEND_BLOCK_TYPES = [BlockTypeEnum.UserSend, BlockTypeEnum.ContractSend];
const RECEIVE_BLOCK_TYPES = [BlockTypeEnum.UserReceive, BlockTypeEnum.ContractReceive];

const TOKEN_CONTRACT_ADDRESS = TOKEN_ADDRESS.toString();

const STAKE_CONTRACT = 'Stake Contract';
const PLASMA_CONTRACT = 'Plasma Contract';

export async function handleBlock(
  event: IndexedAccountBlockEvent,
  db: PluginDb,
): Promise<void> {
  if (event.fromAddress === BURN_ADDRESS) return;

  const cm = event.contractMethod;

  if (cm) {
    if (cm.contractName === STAKE_CONTRACT && cm.methodName === 'Stake') {
      await handleStake(event, db);
      return;
    }
    if (cm.contractName === STAKE_CONTRACT && cm.methodName === 'Cancel') {
      await handleCancelStake(event, db);
      return;
    }
    if (cm.contractName === PLASMA_CONTRACT && cm.methodName === 'Fuse') {
      await handleFuse(event, db);
      return;
    }
    if (cm.contractName === PLASMA_CONTRACT && cm.methodName === 'CancelFuse') {
      await handleCancelFuse(event, db);
      return;
    }
  }

  await handleTransfer(event, db);
}

// ── Transfer ─────────────────────────────────────────────────────────

async function handleTransfer(
  event: IndexedAccountBlockEvent,
  db: PluginDb,
): Promise<void> {
  // Sender side — amount and token come from the block itself
  if (SEND_BLOCK_TYPES.includes(event.blockType) && event.fromAddress !== TOKEN_CONTRACT_ADDRESS) {
    const amount = toBigInt(event.amount);
    if (amount === 0n) return;

    const tokenStandard = event.tokenStandard;
    if (tokenStandard !== ZNN_TOKEN_STANDARD && tokenStandard !== QSR_TOKEN_STANDARD) return;

    const accountId = await getAccountIdByAddress(db, event.fromAddress);
    if (accountId === null) return;

    if (tokenStandard === ZNN_TOKEN_STANDARD) {
      await updateBalance(db, accountId, { znn_balance: -amount, znn_sent: amount });
    } else {
      await updateBalance(db, accountId, { qsr_balance: -amount, qsr_sent: amount });
    }
  }

  // Receiver side — amount and token come from the paired send block
  if (RECEIVE_BLOCK_TYPES.includes(event.blockType) && event.pairedBlockHash) {
    const paired = await getPairedBlock(db, event.pairedBlockHash);
    if (!paired) return;

    const pairedAmount = toBigInt(paired.amount);
    if (pairedAmount === 0n) return;

    if (paired.tokenStandard !== ZNN_TOKEN_STANDARD && paired.tokenStandard !== QSR_TOKEN_STANDARD) return;

    const receiverAddress = event.blockType === BlockTypeEnum.UserReceive
      ? event.fromAddress
      : event.toAddress;
    const accountId = await getAccountIdByAddress(db, receiverAddress);
    if (accountId === null) return;

    if (paired.tokenStandard === ZNN_TOKEN_STANDARD) {
      await updateBalance(db, accountId, { znn_balance: pairedAmount, znn_received: pairedAmount });
    } else {
      await updateBalance(db, accountId, { qsr_balance: pairedAmount, qsr_received: pairedAmount });
    }
  }
}

// ── Stake ─────────────────────────────────────────────────────────────

async function handleStake(event: IndexedAccountBlockEvent, db: PluginDb): Promise<void> {
  const amount = toBigInt(event.amount);
  if (amount === 0n) return;

  const accountId = await getAccountIdByAddress(db, event.fromAddress);
  if (accountId === null) return;

  await updateBalance(db, accountId, { znn_staked: amount });
}

async function handleCancelStake(event: IndexedAccountBlockEvent, db: PluginDb): Promise<void> {
  if (!event.pairedBlockHash) return;

  const originalHash = event.decodedArgs?.id;
  if (!originalHash || typeof originalHash !== 'string') return;

  const originalBlock = await getBlockByHash(db, originalHash.replace(/^0x/, ''));
  if (!originalBlock) return;

  const amount = toBigInt(originalBlock.amount);
  if (amount === 0n) return;

  const accountId = await getAccountIdByAddress(db, originalBlock.fromAddress);
  if (accountId === null) return;

  await updateBalance(db, accountId, { znn_staked: -amount });
}

// ── Plasma ────────────────────────────────────────────────────────────

async function handleFuse(event: IndexedAccountBlockEvent, db: PluginDb): Promise<void> {
  const amount = toBigInt(event.amount);
  if (amount === 0n) return;

  const fuserId = await getAccountIdByAddress(db, event.fromAddress);
  if (fuserId !== null) {
    await updateBalance(db, fuserId, { qsr_fused: amount });
  }

  const recipientId = await getAccountIdByAddress(db, event.toAddress);
  if (recipientId !== null) {
    await updateBalance(db, recipientId, { plasma_amount: amount });
  }
}

async function handleCancelFuse(event: IndexedAccountBlockEvent, db: PluginDb): Promise<void> {
  const originalHash = event.decodedArgs?.id;
  if (!originalHash || typeof originalHash !== 'string') return;

  const originalBlock = await getBlockByHash(db, originalHash.replace(/^0x/, ''));
  if (!originalBlock) return;

  const amount = toBigInt(originalBlock.amount);
  if (amount === 0n) return;

  const fuserId = await getAccountIdByAddress(db, originalBlock.fromAddress);
  if (fuserId !== null) {
    await updateBalance(db, fuserId, { qsr_fused: -amount });
  }

  const recipientId = await getAccountIdByAddress(db, originalBlock.toAddress);
  if (recipientId !== null) {
    await updateBalance(db, recipientId, { plasma_amount: -amount });
  }
}

// ── DB helpers ────────────────────────────────────────────────────────

async function getAccountIdByAddress(db: PluginDb, address: string): Promise<number | null> {
  const rows = await db.query<{ id: number }>(
    'SELECT id FROM nom_accounts WHERE address = $1',
    address,
  );
  return rows[0]?.id ?? null;
}

interface PairedBlock {
  amount: string;
  tokenStandard: string | null;
  fromAddress: string;
  toAddress: string;
}

async function getPairedBlock(db: PluginDb, hash: string): Promise<PairedBlock | null> {
  const rows = await db.query<PairedBlock>(
    `SELECT ab.amount, tok.token_standard as "tokenStandard",
            acc.address as "fromAddress", to_acc.address as "toAddress"
     FROM nom_account_blocks ab
     LEFT JOIN nom_accounts acc ON ab.account_id = acc.id
     LEFT JOIN nom_accounts to_acc ON ab.to_account_id = to_acc.id
     LEFT JOIN nom_tokens tok ON ab.token_id = tok.id
     WHERE ab.hash = $1`,
    hash,
  );
  return rows[0] ?? null;
}

interface BlockInfo {
  amount: string;
  fromAddress: string;
  toAddress: string;
}

async function getBlockByHash(db: PluginDb, hash: string): Promise<BlockInfo | null> {
  const rows = await db.query<BlockInfo>(
    `SELECT ab.amount, acc.address as "fromAddress", to_acc.address as "toAddress"
     FROM nom_account_blocks ab
     LEFT JOIN nom_accounts acc ON ab.account_id = acc.id
     LEFT JOIN nom_accounts to_acc ON ab.to_account_id = to_acc.id
     WHERE ab.hash = $1`,
    hash,
  );
  return rows[0] ?? null;
}

async function updateBalance(
  db: PluginDb,
  accountId: number,
  changes: Record<string, bigint>,
): Promise<void> {
  const columns = Object.keys(changes);
  const values = Object.values(changes).map((v) => v.toString());

  const setClauses = columns
    .map((col) => `${col} = (bl_tracker_balances.${col}::numeric + EXCLUDED.${col}::numeric)::text`)
    .join(',\n           ');

  const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');

  await db.execute(
    `INSERT INTO bl_tracker_balances (account_id, ${columns.join(', ')}, updated_at)
     VALUES ($1::int, ${placeholders}, NOW()::timestamp)
     ON CONFLICT (account_id)
     DO UPDATE SET
           ${setClauses},
           updated_at = NOW()::timestamp`,
    accountId,
    ...values,
  );
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  if (value == null) return 0n;
  return BigInt(value.toString());
}
