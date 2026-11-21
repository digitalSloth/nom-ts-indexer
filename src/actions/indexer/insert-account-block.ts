import { AccountBlock, BlockTypeEnum } from 'znn-typescript-sdk';
import { accountRegistry } from '../../services/registries/account-registry.js';
import { tokenRegistry } from '../../services/registries/token-registry.js';
import { contractRegistry } from '../../services/registries/contract-registry.js';
import { dispatchAction } from '../process/index.js';
import type { IndexedAccountBlockEvent, IndexedMomentumEvent } from '../../plugins/types.js';
import { linkDescendantBlocks } from './link-descendant-blocks.js';
import { linkPairedAccountBlock } from './link-paired-account-block.js';
import { insertAccountBlockData } from './insert-account-block-data.js';
import { updateAccountTokenBalance } from './update-account-token-balance.js';
import { insertAccountReward } from './insert-account-reward.js';
import {
  CALL_STATUS_FAILURE,
  CALL_STATUS_SUCCESS,
  contractCallStatus,
} from './contract-call-status.js';
import {
  LIQUIDITY_PROGRAM_DISTRIBUTOR_ADDRESS,
  QSR_TOKEN_STANDARD,
} from '../../constants/zenon.js';

export interface LinkedBlock {
  id: number;
  accountId: number;
  toAccountId: number;
  tokenId: number | null;
  blockType: BlockTypeEnum;
  amount: string;
  hash: string;
  createdAt: Date;
  contractMethodId: number | null;
  momentumId: number;
}

/**
 * Insert an account block (transaction) into the database.
 *
 * All links (paired, descendant) are resolved inline via DB lookups. If the
 * target block isn't in the DB yet, the link is skipped — it will be set
 * when the target block is processed.
 */
export async function insertAccountBlock(
  tx: any,
  accountBlockData: AccountBlock,
  momentumEvent: IndexedMomentumEvent,
): Promise<IndexedAccountBlockEvent | null> {
  const hash = accountBlockData.hash.toString();

  if (!accountBlockData.confirmationDetail) {
    throw new Error(`Account block ${hash} has no confirmation detail`);
  }

  // Short-circuit on re-runs (crash/restart partway through a momentum).
  const existingBlock = await tx('nom_account_blocks').where({ hash }).select('id').first();
  if (existingBlock) {
    return null;
  }

  const accountId = await accountRegistry.getOrCreate(tx, accountBlockData.address.toString());
  const toAccountId = await accountRegistry.getOrCreate(tx, accountBlockData.toAddress.toString());
  const tokenId = accountBlockData.token
    ? await tokenRegistry.getOrLoad(tx, accountBlockData.token.tokenStandard?.toString())
    : null;
  const momentumId = await resolveMomentumId(
    tx,
    accountBlockData.confirmationDetail.momentumHash.toString(),
  );

  if (momentumId === null) {
    throw new Error(
      `Momentum not found for account block: ${accountBlockData.confirmationDetail.momentumHash}`,
    );
  }

  const ackHash = accountBlockData.momentumAcknowledged.hash.toString();
  const pairedHash = accountBlockData.pairedAccountBlock?.hash?.toString();
  const momentumAck = await tx('nom_momentums')
    .where({ hash: ackHash })
    .select('id', 'height', 'created_at')
    .first();
  const momentumAckId: number | null = momentumAck?.id ?? null;
  const blockTimestamp = new Date(accountBlockData.confirmationDetail.momentumTimestamp * 1000);
  const callStatus = contractCallStatus(accountBlockData);

  await applyAccountUpdate(tx, accountId, accountBlockData, blockTimestamp);

  const [accountBlock] = await tx('nom_account_blocks')
    .insert({
      account_id: accountId,
      to_account_id: toAccountId,
      momentum_id: momentumId,
      momentum_acknowledged_id: momentumAckId,
      token_id: tokenId ?? null,
      version: accountBlockData.version,
      block_type: accountBlockData.blockType,
      height: BigInt(accountBlockData.height),
      amount: accountBlockData.amount.toString(),
      fused_plasma: BigInt(accountBlockData.fusedPlasma),
      base_plasma: BigInt(accountBlockData.basePlasma),
      used_plasma: BigInt(accountBlockData.usedPlasma),
      difficulty: BigInt(accountBlockData.difficulty),
      nonce: accountBlockData.nonce ?? null,
      call_status: callStatus,
      hash,
      created_at: blockTimestamp,
    })
    .onConflict('hash')
    .merge()
    .returning([
      'id',
      'account_id',
      'to_account_id',
      'token_id',
      'block_type',
      'amount',
      'hash',
      'created_at',
      'contract_method_id',
      'momentum_id',
    ]);

  const block: LinkedBlock = {
    id: accountBlock.id,
    accountId: accountBlock.account_id,
    toAccountId: accountBlock.to_account_id,
    tokenId: accountBlock.token_id,
    blockType: accountBlock.block_type,
    amount: accountBlock.amount,
    hash: accountBlock.hash,
    createdAt: accountBlock.created_at,
    contractMethodId: accountBlock.contract_method_id,
    momentumId: accountBlock.momentum_id,
  };

  if (accountBlockData.descendantBlocks?.length > 0) {
    await linkDescendantBlocks(tx, block.id, accountBlockData.descendantBlocks);
  }

  let pairedBlock: LinkedBlock | null = null;
  if (pairedHash) {
    pairedBlock = await linkPairedAccountBlock(tx, block.id, pairedHash);
  }

  // Lists find failed calls by a flag on the send, so the send carries the
  // failure its contract receive reports, whichever of the two lands first.
  if (pairedBlock && callStatus === CALL_STATUS_FAILURE) {
    await tx('nom_account_blocks').where({ id: pairedBlock.id }).update({ call_failed: true });
  } else if (
    pairedBlock &&
    (accountBlockData.blockType === BlockTypeEnum.UserSend ||
      accountBlockData.blockType === BlockTypeEnum.ContractSend)
  ) {
    await tx('nom_account_blocks')
      .where({ id: block.id })
      .update({
        call_failed: tx.raw(
          'EXISTS (SELECT 1 FROM nom_account_blocks r WHERE r.id = ? AND r.call_status = ?)',
          [pairedBlock.id, CALL_STATUS_FAILURE],
        ),
      });
  }

  let rawData = Buffer.alloc(0);
  let decodedArgs: Record<string, unknown> | null = null;
  let contractMethodIdForEvent: number | null = null;

  if (accountBlockData.data && accountBlockData.data.length > 0) {
    const dataResult = await insertAccountBlockData(tx, block.id, toAccountId, accountBlockData);
    rawData = dataResult.rawData;
    decodedArgs = dataResult.decodedArgs;
    contractMethodIdForEvent = dataResult.contractMethodId;
  }

  // Only a successful call changes contract state, so failed calls never
  // reach a handler.
  if (pairedBlock && pairedBlock.contractMethodId && callStatus === CALL_STATUS_SUCCESS) {
    if (!momentumAck) {
      throw new Error(`Acknowledged momentum ${ackHash} not found for contract receive ${hash}`);
    }
    await dispatchAction(tx, block, pairedBlock, {
      height: BigInt(momentumAck.height),
      timestamp: new Date(momentumAck.created_at),
    });
  }

  // Track token balances in nom_account_tokens. The token contract's
  // handlers add the supply it issues or mints before it sends it out.
  const sendBlockTypes = [BlockTypeEnum.UserSend, BlockTypeEnum.ContractSend];
  const blockAmount = accountBlockData.amount.toString();

  if (
    sendBlockTypes.includes(accountBlockData.blockType) &&
    blockAmount !== '0' &&
    tokenId !== null
  ) {
    await updateAccountTokenBalance(tx, accountId, tokenId, -BigInt(blockAmount), blockTimestamp);
  }

  if (
    accountBlockData.blockType === BlockTypeEnum.UserSend &&
    accountBlockData.address.toString() === LIQUIDITY_PROGRAM_DISTRIBUTOR_ADDRESS &&
    accountBlockData.token?.tokenStandard?.toString() === QSR_TOKEN_STANDARD &&
    blockAmount !== '0' &&
    tokenId !== null
  ) {
    await insertAccountReward(tx, {
      accountId: toAccountId,
      tokenId,
      accountBlockId: block.id,
      type: 'liquidity_program',
      amount: blockAmount,
      createdAt: blockTimestamp,
    });
  }

  const receiveBlockTypes = [BlockTypeEnum.UserReceive, BlockTypeEnum.ContractReceive];
  if (
    receiveBlockTypes.includes(accountBlockData.blockType) &&
    pairedBlock &&
    pairedBlock.amount !== '0' &&
    pairedBlock.tokenId !== null
  ) {
    await updateAccountTokenBalance(
      tx,
      accountId,
      pairedBlock.tokenId,
      BigInt(pairedBlock.amount),
      blockTimestamp,
    );
  }

  // Build the event for plugin dispatch
  const tokenStandard = accountBlockData.token?.tokenStandard?.toString() ?? null;
  const contractMethod = contractRegistry.getMethod(contractMethodIdForEvent) ?? null;

  return {
    accountBlockId: block.id,
    hash,
    blockType: accountBlockData.blockType,
    height: BigInt(accountBlockData.height),
    fromAddress: accountBlockData.address.toString(),
    toAddress: accountBlockData.toAddress.toString(),
    amount: accountBlockData.amount.toString(),
    tokenStandard,
    rawData,
    decodedArgs,
    momentum: momentumEvent,
    contractMethod,
    pairedBlockHash: pairedHash ?? null,
    callStatus,
  };
}

async function resolveMomentumId(tx: any, hash: string): Promise<number | null> {
  const momentum = await tx('nom_momentums').where({ hash }).select('id').first();
  return momentum?.id ?? null;
}

async function applyAccountUpdate(
  tx: any,
  accountId: number,
  block: AccountBlock,
  ts: Date,
): Promise<void> {
  // Genesis blocks carry no key; the SDK turns that into an empty buffer.
  const publicKey =
    block.publicKey && block.publicKey.length !== 0 ? block.publicKey.toString() : null;
  const firstActiveAtCandidate = publicKey ? ts : null;

  await tx('nom_accounts')
    .where({ id: accountId })
    .update({
      last_active_at: tx.raw('GREATEST(last_active_at, ?)', [ts]),
      public_key: tx.raw('COALESCE(public_key, ?)', [publicKey]),
      first_active_at: tx.raw('COALESCE(first_active_at, ?)', [firstActiveAtCandidate]),
    });
}
