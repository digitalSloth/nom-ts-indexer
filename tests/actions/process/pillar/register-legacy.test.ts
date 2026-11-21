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

const { PILLAR_QSR_STAKE_BASE_AMOUNT } = await import('../../../../src/constants/zenon.js');
const { swapKeyIdHash } = await import('../../../../src/actions/process/swap/key-id-hash.js');
// A compressed secp256k1 public key (the generator point), base64
const PUBLIC_KEY = Buffer.from(
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  'hex',
).toString('base64');
const { registerLegacy } =
  await import('../../../../src/actions/process/pillar/register-legacy.js');

describe('registerLegacy', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(10);
    setPillarId.mockReset();
  });

  it('creates legacy pillar and takes the base QSR cost from the deposit', async () => {
    tx.resolveNext({ id: 42 }); // insert pillar
    tx.resolveNext({ id: 7, amount: PILLAR_QSR_STAKE_BASE_AMOUNT.toString() }); // deposit lookup
    tx.resolveNext({}); // deposit delete
    tx.resolveNext({ id: 3, remaining_count: 2 }); // legacy entry lookup
    tx.resolveNext({}); // legacy entry update

    const ctx = makeActionContext({
      tx,
      decoded: {
        publicKey: PUBLIC_KEY,
        name: 'LegacyPillar',
        producerAddress: 'z1qproducer',
        rewardAddress: 'z1qreward',
        giveBlockRewardPercentage: 50,
        giveDelegateRewardPercentage: 75,
      },
    });
    await expect(registerLegacy(ctx)).resolves.toBeUndefined();

    expect(setPillarId).toHaveBeenCalledWith(10, 42);
    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ qsr_burn: PILLAR_QSR_STAKE_BASE_AMOUNT, is_legacy: true }),
    );
    expect(tx.mock.results[2].value.del).toHaveBeenCalled();
    expect(tx.mock.results[3].value.where).toHaveBeenCalledWith({
      key_id_hash: swapKeyIdHash(PUBLIC_KEY),
    });
    expect(tx.mock.results[4].value.update).toHaveBeenCalledWith({ remaining_count: 1 });
  });

  it('throws when the legacy key has no genesis entry', async () => {
    tx.resolveNext({ id: 42 }); // insert pillar
    tx.resolveNext({ id: 7, amount: PILLAR_QSR_STAKE_BASE_AMOUNT.toString() }); // deposit lookup
    tx.resolveNext({}); // deposit delete
    tx.resolveNext(null); // legacy entry lookup

    const ctx = makeActionContext({
      tx,
      decoded: {
        publicKey: PUBLIC_KEY,
        name: 'LegacyPillar',
        producerAddress: 'z1qproducer',
        rewardAddress: 'z1qreward',
        giveBlockRewardPercentage: 50,
        giveDelegateRewardPercentage: 75,
      },
    });
    await expect(registerLegacy(ctx)).rejects.toThrow(/legacy pillar entry not found/);
  });
});
