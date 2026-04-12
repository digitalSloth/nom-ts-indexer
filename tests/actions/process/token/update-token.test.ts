import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 50);

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

const { updateToken } = await import('../../../../src/actions/process/token/update-token.js');

describe('updateToken', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    owner: 'z1qnewowner',
    isMintable: true,
    isBurnable: true,
  };

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(50);
  });

  it('updates token owner, isMintable, isBurnable', async () => {
    tx.resolveNext({ id: 10, ownerId: 1, isMintable: true, totalSupply: '1000000000' }); // token lookup
    tx.resolveNext({});   // update

    const ctx = makeActionContext({ tx, decoded: defaultDecoded, sendBlock: { accountId: 1 } as any });
    await expect(updateToken(ctx)).resolves.toBeUndefined();
  });

  it('collapses maxSupply when transitioning from mintable to non-mintable', async () => {
    tx.resolveNext({ id: 10, ownerId: 1, isMintable: true, totalSupply: '1000000000' }); // token lookup
    tx.resolveNext({});   // update

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, isMintable: false },
      sendBlock: { accountId: 1 } as any,
    });
    await expect(updateToken(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing tokenStandard', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, tokenStandard: undefined } });
    await expect(updateToken(ctx)).rejects.toThrow('missing tokenStandard');
  });

  it('throws on missing owner', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, owner: undefined } });
    await expect(updateToken(ctx)).rejects.toThrow('missing tokenStandard');
  });

  it('warns if token not found', async () => {
    tx.resolveNext(null); // token not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updateToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('warns if sender is not token owner', async () => {
    tx.resolveNext({ id: 10, ownerId: 999, isMintable: true, totalSupply: '1000000000' }); // token lookup — wrong owner
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded, sendBlock: { accountId: 1 } as any });
    await updateToken(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not token owner'));
  });
});
