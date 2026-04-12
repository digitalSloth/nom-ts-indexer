import { AccountBlock, BlockTypeEnum, Hash, TOKEN_ADDRESS } from 'znn-typescript-sdk';
import { accountRegistry } from '../../services/registries/account-registry.js';
import { tokenRegistry } from '../../services/registries/token-registry.js';
import { contractRegistry } from '../../services/registries/contract-registry.js';
import { dispatchAction } from '../process/index.js';
import type { IndexedAccountBlockEvent, IndexedMomentumEvent } from '../../plugins/types.js';
import { linkDescendantBlocks } from './link-descendant-blocks.js';
import { linkPairedAccountBlock } from './link-paired-account-block.js';
import { insertAccountBlockData } from './insert-account-block-data.js';
import { updateAccountTokenBalance } from './update-account-token-balance.js';

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
  const momentumAckId = await resolveMomentumId(tx, ackHash);
  const blockTimestamp = new Date(accountBlockData.confirmationDetail.momentumTimestamp * 1000);

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

  let rawData = Buffer.alloc(0);
  let decodedArgs: Record<string, unknown> | null = null;
  let contractMethodIdForEvent: number | null = null;

  if (accountBlockData.data && accountBlockData.data.length > 0) {
    const dataResult = await insertAccountBlockData(tx, block.id, toAccountId, accountBlockData);
    rawData = dataResult.rawData;
    decodedArgs = dataResult.decodedArgs;
    contractMethodIdForEvent = dataResult.contractMethodId;
  }

  const receiveBlockTypes = [BlockTypeEnum.UserReceive, BlockTypeEnum.ContractReceive];
  if (
    pairedBlock &&
    pairedBlock.contractMethodId &&
    receiveBlockTypes.includes(accountBlockData.blockType)
  ) {
    await dispatchAction(tx, block, pairedBlock);
  }

  // Track token balances in nom_account_tokens
  const sendBlockTypes = [BlockTypeEnum.UserSend, BlockTypeEnum.ContractSend];
  const tokenContractAddress = TOKEN_ADDRESS.toString();
  const blockAmount = accountBlockData.amount.toString();

  if (
    sendBlockTypes.includes(accountBlockData.blockType) &&
    accountBlockData.address.toString() !== tokenContractAddress &&
    blockAmount !== '0' &&
    tokenId !== null
  ) {
    await updateAccountTokenBalance(tx, accountId, tokenId, -BigInt(blockAmount), blockTimestamp);
  }

  if (
    receiveBlockTypes.includes(accountBlockData.blockType) &&
    pairedBlock &&
    pairedBlock.amount !== '0' &&
    pairedBlock.tokenId !== null
  ) {
    await updateAccountTokenBalance(tx, accountId, pairedBlock.tokenId, BigInt(pairedBlock.amount), blockTimestamp);
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
  const publicKey = block.publicKey ? block.publicKey.toString() : null;
  const firstActiveAtCandidate = publicKey ? ts : null;

  await tx('nom_accounts')
    .where({ id: accountId })
    .update({
      last_active_at: ts,
      public_key: tx.raw('COALESCE(public_key, ?)', [publicKey]),
      first_active_at: tx.raw('COALESCE(first_active_at, ?)', [firstActiveAtCandidate]),
    });
}
