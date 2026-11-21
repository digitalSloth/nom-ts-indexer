import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { buildersFor } from '../bridge/helpers.js';

const { unlockLiquidityStakeEntries } =
  await import('../../../../src/actions/process/liquidity/unlock-liquidity-stake-entries.js');

const NOW = new Date('2024-01-01T00:00:00Z');

describe('unlockLiquidityStakeEntries', () => {
  it("expires the unexpired liquidity stakes of the call's token now", async () => {
    const tx = makeMockTx();

    await unlockLiquidityStakeEntries(
      makeActionContext({
        tx,
        sendBlock: { tokenId: 7, toAccountId: 30 },
        frontierMomentum: { timestamp: NOW },
      }),
    );

    const [stakes] = buildersFor(tx, 'nom_stakes');
    expect(stakes.where).toHaveBeenCalledWith({ token_id: 7 });
    expect(stakes.where).toHaveBeenCalledWith('expires_at', '>', NOW);
    expect(stakes.update).toHaveBeenCalledWith({ expires_at: NOW });

    // Only stakes sent to the liquidity contract, not Stake contract entries
    const [blocks] = buildersFor(tx, 'nom_account_blocks');
    expect(blocks.where).toHaveBeenCalledWith({ to_account_id: 30 });
    expect(stakes.whereIn).toHaveBeenCalledWith('account_block_id', blocks);
  });
});
