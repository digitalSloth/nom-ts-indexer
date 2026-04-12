import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { liquidityStake } = await import('../../../../src/actions/process/liquidity/liquidity-stake.js');

describe('liquidityStake', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a liquidity stake record', async () => {
    tx.resolveNext(null); // no existing stake
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({
      tx,
      decoded: { durationInSec: 604800 },
      sendBlock: { id: 10, accountId: 1, tokenId: 5, amount: '1000000000' } as any,
    });
    await expect(liquidityStake(ctx)).resolves.toBeUndefined();
  });

  it('skips if stake already exists (idempotent)', async () => {
    tx.resolveNext({ id: 99 }); // existing stake found

    const ctx = makeActionContext({
      tx,
      decoded: { durationInSec: 604800 },
      sendBlock: { id: 10, accountId: 1, tokenId: 5, amount: '1000000000' } as any,
    });
    await expect(liquidityStake(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing durationInSec', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(liquidityStake(ctx)).rejects.toThrow('missing durationInSec');
  });

  it('warns if tokenId is null', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { durationInSec: 604800 },
      sendBlock: { tokenId: null, amount: '1000' } as any,
    });
    await liquidityStake(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no token'));
  });

  it('warns if amount is zero', async () => {
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { durationInSec: 604800 },
      sendBlock: { tokenId: 5, amount: '0' } as any,
    });
    await liquidityStake(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('amount is zero'));
  });

  it('converts durationInSec to BigInt', async () => {
    tx.resolveNext(null); // no existing stake
    tx.resolveNext({});   // insert

    const ctx = makeActionContext({
      tx,
      decoded: { durationInSec: '2592000' }, // string input
      sendBlock: { id: 10, accountId: 1, tokenId: 5, amount: '500' } as any,
    });
    await expect(liquidityStake(ctx)).resolves.toBeUndefined();
  });
});
