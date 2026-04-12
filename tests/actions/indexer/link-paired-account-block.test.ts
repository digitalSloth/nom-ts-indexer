import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';
import { linkPairedAccountBlock } from '../../../src/actions/indexer/link-paired-account-block.js';

describe('linkPairedAccountBlock', () => {
  let tx: MockKnex;

  beforeEach(() => {
    tx = makeMockKnex();
  });

  it('returns null when paired block is not found', async () => {
    tx.resolveNext(null);

    const result = await linkPairedAccountBlock(tx, 1, 'missing_hash');

    expect(result).toBeNull();
  });

  it('links forward and reverse when both sides are unlinked', async () => {
    tx.resolveNext({
      id: 20,
      paired_account_block_id: null,
      account_id: 1,
      to_account_id: 2,
      token_id: 5,
      amount: '100',
      hash: 'paired_hash',
      created_at: new Date(),
      contract_method_id: null,
      momentum_id: 3,
      block_type: 3,
    });

    const result = await linkPairedAccountBlock(tx, 10, 'paired_hash');

    expect(result).toEqual({
      id: 20,
      accountId: 1,
      toAccountId: 2,
      tokenId: 5,
      blockType: 3,
      amount: '100',
      hash: 'paired_hash',
      createdAt: expect.any(Date),
      contractMethodId: null,
      momentumId: 3,
    });
  });

  it('does not reverse-link when paired block already has a link', async () => {
    tx.resolveNext({
      id: 20,
      paired_account_block_id: 99, // already linked
      account_id: 1,
      to_account_id: 2,
      token_id: 5,
      amount: '100',
      hash: 'paired_hash',
      created_at: new Date(),
      contract_method_id: null,
      momentum_id: 3,
      block_type: 3,
    });

    const result = await linkPairedAccountBlock(tx, 10, 'paired_hash');

    expect(result).not.toBeNull();
    expect(result!.id).toBe(20);
  });

  it('defaults blockType to 0 when null', async () => {
    tx.resolveNext({
      id: 20,
      paired_account_block_id: null,
      account_id: 1,
      to_account_id: 2,
      token_id: null,
      amount: '0',
      hash: 'paired_hash',
      created_at: new Date(),
      contract_method_id: null,
      momentum_id: 3,
      block_type: null,
    });

    const result = await linkPairedAccountBlock(tx, 10, 'paired_hash');

    expect(result!.blockType).toBe(0);
  });
});
