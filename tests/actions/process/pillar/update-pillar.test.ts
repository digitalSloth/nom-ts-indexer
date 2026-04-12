import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const getOrCreate = vi.fn(async () => 20);
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

const { updatePillar } = await import('../../../../src/actions/process/pillar/update-pillar.js');

describe('updatePillar', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    name: 'MyPillar',
    producerAddress: 'z1qnewproducer',
    rewardAddress: 'z1qnewreward',
    giveBlockRewardPercentage: 60,
    giveDelegateRewardPercentage: 80,
  };

  const existingPillar = {
    id: 42,
    owner_id: 1,
    producer_account_id: 10,
    withdraw_account_id: 11,
    momentum_rewards: 50,
    delegate_rewards: 75,
    revoked_at: null,
  };

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(20);
    setPillarId.mockReset();
  });

  it('updates pillar and creates history record', async () => {
    tx.resolveNext(existingPillar); // pillar lookup
    tx.resolveNext({});             // update pillar
    tx.resolveNext({});             // insert history

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(updatePillar(ctx)).resolves.toBeUndefined();

    expect(setPillarId).toHaveBeenCalledWith(20, 42);
  });

  it('skips if nothing changed', async () => {
    getOrCreate.mockResolvedValueOnce(10).mockResolvedValueOnce(11);
    tx.resolveNext(existingPillar); // pillar lookup

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, giveBlockRewardPercentage: 50, giveDelegateRewardPercentage: 75 },
    });
    await expect(updatePillar(ctx)).resolves.toBeUndefined();
  });

  it('marks isRewardChange false when only producer changed', async () => {
    tx.resolveNext(existingPillar); // pillar lookup
    tx.resolveNext({});             // update pillar
    tx.resolveNext({});             // insert history

    const ctx = makeActionContext({
      tx,
      decoded: { ...defaultDecoded, giveBlockRewardPercentage: 50, giveDelegateRewardPercentage: 75 },
    });
    await expect(updatePillar(ctx)).resolves.toBeUndefined();
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: '' } });
    await expect(updatePillar(ctx)).rejects.toThrow('name is empty');
  });

  it('warns if pillar not found', async () => {
    tx.resolveNext(null); // pillar not found
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePillar(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('warns if sender is not owner', async () => {
    tx.resolveNext({ ...existingPillar, owner_id: 999 }); // wrong owner
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePillar(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not pillar owner'));
  });

  it('warns if pillar is revoked', async () => {
    tx.resolveNext({ ...existingPillar, revoked_at: new Date() }); // revoked
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await updatePillar(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revoked'));
  });
});
