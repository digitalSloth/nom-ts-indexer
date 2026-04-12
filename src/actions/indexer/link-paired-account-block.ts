import type { LinkedBlock } from './insert-account-block.js';

/**
 * Link two paired account blocks (send ↔ receive) bidirectionally.
 * Returns the paired block as a LinkedBlock, or null if not found in the DB.
 */
export async function linkPairedAccountBlock(
  tx: any,
  blockId: number,
  pairedHash: string,
): Promise<LinkedBlock | null> {
  const paired = await tx('nom_account_blocks')
    .where({ hash: pairedHash })
    .select(
      'id',
      'paired_account_block_id',
      'account_id',
      'to_account_id',
      'token_id',
      'amount',
      'hash',
      'created_at',
      'contract_method_id',
      'momentum_id',
    )
    .first();
  if (!paired) return null;

  // Forward: this block → paired block
  await tx('nom_account_blocks')
    .where({ id: blockId, paired_account_block_id: null })
    .update({ paired_account_block_id: paired.id });

  // Reverse: paired block → this block
  if (!paired.paired_account_block_id) {
    await tx('nom_account_blocks')
      .where({ id: paired.id })
      .update({ paired_account_block_id: blockId });
  }

  return {
    id: paired.id,
    accountId: paired.account_id,
    toAccountId: paired.to_account_id,
    tokenId: paired.token_id,
    blockType: paired.block_type ?? 0,
    amount: paired.amount,
    hash: paired.hash,
    createdAt: paired.created_at,
    contractMethodId: paired.contract_method_id,
    momentumId: paired.momentum_id,
  };
}
