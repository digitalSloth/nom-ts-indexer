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

const { PILLAR_QSR_STAKE_BASE_AMOUNT, PILLAR_QSR_STAKE_INCREASE_AMOUNT } =
  await import('../../../../src/constants/zenon.js');
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

  const COST = PILLAR_QSR_STAKE_BASE_AMOUNT + PILLAR_QSR_STAKE_INCREASE_AMOUNT * 5n;

  it('creates pillar and updates registry', async () => {
    tx.resolveNext({ c: '5' }); // count query
    tx.resolveNext({ id: 42 }); // insert pillar
    tx.resolveNext({ id: 7, amount: COST.toString() }); // deposit lookup

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await register(ctx);

    expect(setPillarId).toHaveBeenCalledWith(10, 42);
  });

  it('prices the QSR burn by the number of active non-legacy pillars', async () => {
    tx.resolveNext({ c: '5' }); // count query
    tx.resolveNext({ id: 42 }); // insert pillar
    tx.resolveNext({ id: 7, amount: COST.toString() }); // deposit lookup

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await register(ctx);

    const countBuilder = tx.mock.results[0].value;
    expect(countBuilder.where).toHaveBeenCalledWith({ is_legacy: false, revoked_at: null });
    const insertBuilder = tx.mock.results[1].value;
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MyPillar',
        qsr_burn: COST,
        momentum_rewards: 50,
        delegate_rewards: 75,
        is_legacy: false,
      }),
    );
  });

  it('takes the pillar cost from the owner deposit in the pillar contract', async () => {
    tx.resolveNext({ c: '5' }); // count query
    tx.resolveNext({ id: 42 }); // insert pillar
    tx.resolveNext({ id: 7, amount: (COST + 100n).toString() }); // deposit lookup
    tx.resolveNext({}); // deposit update

    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await register(ctx);

    expect(tx.mock.results[2].value.where).toHaveBeenCalledWith({
      account_id: 1,
      contract_account_id: 2,
    });
    expect(tx.mock.results[3].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '100' }),
    );
  });
});
