import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { mint } = await import('../../../../src/actions/process/token/mint.js');

describe('mint', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    amount: '500000000',
    receiveAddress: 'z1qreceiver',
  };

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(50);
  });

  it('creates mint record and updates total_supply', async () => {
    tx.resolveNext({ id: 10, total_supply: '1000000000' }); // token lookup
    tx.resolveNext({});   // insert mint
    tx.resolveNext({});   // update token

    const ctx = makeActionContext({ tx, decoded: defaultDecoded, sendBlock: { id: 5, accountId: 1 } as any });
    await expect(mint(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing tokenStandard', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, tokenStandard: undefined } });
    await expect(mint(ctx)).rejects.toThrow('missing tokenStandard');
  });

  it('throws on missing amount', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, amount: undefined } });
    await expect(mint(ctx)).rejects.toThrow('missing tokenStandard');
  });

  it('warns if token not found', async () => {
    tx.resolveNext(null); // token not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await mint(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
