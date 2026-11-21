import { contractRegistry } from '../../services/registries/contract-registry.js';
import { getHandler, warnMissingOnce } from './registry.js';
import type { ActionContext, FrontierMomentum, KnexTransactionClient } from './types.js';
import type { LinkedBlock } from '../indexer/insert-account-block.js';

/**
 * Dispatch a successful contract call to its action handler. The caller only
 * dispatches receive blocks whose call status is success, so a handler never
 * needs to repeat the contract's own validation.
 */
export async function dispatchAction(
  tx: KnexTransactionClient,
  receiveBlock: LinkedBlock,
  sendBlock: LinkedBlock,
  frontierMomentum: FrontierMomentum,
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

  const row = await tx('nom_account_block_data')
    .select('decoded')
    .where('account_block_id', sendBlock.id)
    .first();
  if (!row?.decoded) {
    throw new Error(
      `${method.contractName}.${method.methodName}: send block ${sendBlock.hash} has no decoded data`,
    );
  }
  const parsed: Record<string, any> = JSON.parse(row.decoded);

  const ctx: ActionContext = {
    tx,
    receiveBlock: {
      id: receiveBlock.id,
      momentumId: receiveBlock.momentumId,
      createdAt: receiveBlock.createdAt,
    },
    frontierMomentum,
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
