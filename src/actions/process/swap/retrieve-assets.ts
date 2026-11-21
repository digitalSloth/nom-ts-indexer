import type { ActionContext, ActionHandler } from '../types.js';
import { ZNN_TOKEN_STANDARD, QSR_TOKEN_STANDARD } from '../../../constants/zenon.js';
import { swapKeyIdHash } from './key-id-hash.js';

/**
 * Records the retrieval of a legacy swap entry. The contract pays it out by
 * sending Mint calls for the decayed ZNN and QSR amounts from this receive,
 * so the paid amounts are read from those descendant blocks.
 */
export const retrieveAssets: ActionHandler = async (ctx: ActionContext): Promise<void> => {
  const { tx, decoded, sendBlock, receiveBlock } = ctx;
  const publicKey = String(decoded.publicKey);
  const keyIdHash = swapKeyIdHash(publicKey);

  const entry = await tx('nom_swap_entries').where({ key_id_hash: keyIdHash }).select('id').first();
  if (!entry) {
    throw new Error(`Swap.RetrieveAssets: swap entry not found for ${keyIdHash}`);
  }

  const mints = await tx('nom_account_blocks as ab')
    .join('nom_account_block_data as d', 'd.account_block_id', 'ab.id')
    .where('ab.parent_id', receiveBlock.id)
    .select('d.decoded');

  let retrievedZnn = 0n;
  let retrievedQsr = 0n;
  for (const mint of mints) {
    const args = mint.decoded ? JSON.parse(mint.decoded) : null;
    if (args?.tokenStandard === ZNN_TOKEN_STANDARD) {
      retrievedZnn += BigInt(args.amount);
    } else if (args?.tokenStandard === QSR_TOKEN_STANDARD) {
      retrievedQsr += BigInt(args.amount);
    }
  }

  await tx('nom_swap_entries').where({ id: entry.id }).update({
    account_id: sendBlock.accountId,
    account_block_id: sendBlock.id,
    public_key: publicKey,
    retrieved_znn: retrievedZnn.toString(),
    retrieved_qsr: retrievedQsr.toString(),
    retrieved_at: receiveBlock.createdAt,
  });
};
