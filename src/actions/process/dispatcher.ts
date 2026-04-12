import { contractRegistry } from '../../services/registries/contract-registry.js';
import { getHandler, warnMissingOnce } from './registry.js';
import type { ActionContext, KnexTransactionClient } from './types.js';
import type { LinkedBlock } from '../indexer/insert-account-block.js';

/**
 * Dispatch a contract-receive block to its action handler.
 */
export async function dispatchAction(
  tx: KnexTransactionClient,
  receiveBlock: LinkedBlock,
  sendBlock: LinkedBlock,
): Promise<void> {
  const method = contractRegistry.getMethod(sendBlock.contractMethodId);
  if (!method) {
    return;
  }

  const handler = getHandler(method.contractName, method.methodName);
  if (!handler) {
    warnMissingOnce(method.contractName, method.methodName);
    return;
  }

  let parsed: Record<string, any>;
  try {
    const row = await tx('nom_account_block_data')
      .select('decoded')
      .where('account_block_id', sendBlock.id)
      .first();
    if (!row?.decoded) return;
    parsed = JSON.parse(row.decoded);
  } catch (err) {
    console.error(
      `Failed to parse decoded JSON for send block ${sendBlock.hash}: ${(err as Error).message}`,
    );
    return;
  }

  const ctx: ActionContext = {
    tx,
    receiveBlock: {
      id: receiveBlock.id,
      momentumId: receiveBlock.momentumId,
      createdAt: receiveBlock.createdAt,
    },
    sendBlock: {
      id: sendBlock.id,
      accountId: sendBlock.accountId,
      toAccountId: sendBlock.toAccountId,
      tokenId: sendBlock.tokenId,
      amount: sendBlock.amount,
      hash: sendBlock.hash,
      createdAt: sendBlock.createdAt,
    },
    decoded: parsed,
  };

  await handler(ctx);
}
