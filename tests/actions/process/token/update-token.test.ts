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
    isBurnable: false,
  };

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(50);
  });

  function tokenUpdate() {
    return tx.mock.results[1].value.update.mock.calls[0][0];
  }

  it('sets the owner and flags from the call', async () => {
    tx.resolveNext({ id: 10, is_mintable: true, total_supply: '1000000000' });

    await updateToken(makeActionContext({ tx, decoded: defaultDecoded }));

    expect(getOrCreate).toHaveBeenCalledWith(tx, 'z1qnewowner');
    expect(tokenUpdate()).toEqual({
      owner_id: 50,
      is_mintable: true,
      is_burnable: false,
      updated_at: new Date('2024-01-01T00:00:00Z'),
    });
  });

  it('drops max_supply to total_supply when a token stops being mintable', async () => {
    tx.resolveNext({ id: 10, is_mintable: true, total_supply: '1000000000' });

    await updateToken(makeActionContext({ tx, decoded: { ...defaultDecoded, isMintable: false } }));

    expect(tokenUpdate()).toMatchObject({ is_mintable: false, max_supply: '1000000000' });
  });

  it('throws when the token is not indexed', async () => {
    tx.resolveNext(null);

    await expect(updateToken(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Token.UpdateToken: token not found for zts1znnxxxxxxxxxxxxx9z4ulx',
    );
  });
});
