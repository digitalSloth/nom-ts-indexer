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

const { register } = await import('../../../../src/actions/process/pillar/register.js');

describe('register', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    name: 'MyPillar',
    producerAddress: 'z1qproducer',
    rewardAddress: 'z1qreward',
    giveBlockRewardPercentage: 50,
    giveDelegateRewardPercentage: 75,
  };

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(10);
    setPillarId.mockReset();
  });

  it('creates pillar and updates registry', async () => {
    tx.resolveNext({ c: '5' }); // count query → 5
    tx.resolveNext({ id: 42 }); // insert pillar

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await expect(register(ctx)).resolves.toBeUndefined();

    expect(setPillarId).toHaveBeenCalledWith(10, 42);
  });

  it('throws on missing name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: undefined } });
    await expect(register(ctx)).rejects.toThrow('missing required field "name"');
  });

  it('throws on empty name', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, name: '' } });
    await expect(register(ctx)).rejects.toThrow('name is empty');
  });

  it('throws on missing producerAddress', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, producerAddress: undefined } });
    await expect(register(ctx)).rejects.toThrow('missing required field "producerAddress"');
  });

  it('throws on missing giveBlockRewardPercentage', async () => {
    const ctx = makeActionContext({ tx, decoded: { ...defaultDecoded, giveBlockRewardPercentage: undefined } });
    await expect(register(ctx)).rejects.toThrow('missing required field');
  });
});
