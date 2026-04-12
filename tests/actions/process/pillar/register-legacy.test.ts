import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 10);
const setPillarId = vi.fn();

vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: {
    getOrCreate: (...args: any[]) => getOrCreate(...args),
  },
}));

vi.mock('../../../../src/services/registries/pillar-registry.js', () => ({
  pillarRegistry: {
    setPillarId: (...args: any[]) => setPillarId(...args),
  },
}));

const { registerLegacy } = await import('../../../../src/actions/process/pillar/register-legacy.js');

describe('registerLegacy', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(10);
    setPillarId.mockReset();
  });

  it('creates legacy pillar with fixed QSR cost', async () => {
    tx.resolveNext({ id: 42 }); // insert pillar

    const ctx = makeActionContext({
      tx,
      decoded: {
        name: 'LegacyPillar',
        producerAddress: 'z1qproducer',
        rewardAddress: 'z1qreward',
        giveBlockRewardPercentage: 50,
        giveDelegateRewardPercentage: 75,
      },
    });
    await expect(registerLegacy(ctx)).resolves.toBeUndefined();

    expect(setPillarId).toHaveBeenCalledWith(10, 42);
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { name: '', producerAddress: 'a', rewardAddress: 'b' } });
    await expect(registerLegacy(ctx)).rejects.toThrow('name is empty');
  });

  it('throws on missing producerAddress', async () => {
    const ctx = makeActionContext({ tx, decoded: { name: 'P', rewardAddress: 'b' } });
    await expect(registerLegacy(ctx)).rejects.toThrow('missing producer/reward address');
  });

  it('throws on missing rewardAddress', async () => {
    const ctx = makeActionContext({ tx, decoded: { name: 'P', producerAddress: 'a' } });
    await expect(registerLegacy(ctx)).rejects.toThrow('missing producer/reward address');
  });
});
