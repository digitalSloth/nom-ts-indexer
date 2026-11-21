import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { BRIDGE_ADMINISTRATOR_DELAY } from '../../../../src/constants/zenon.js';
import { argsFor, buildersFor } from './helpers.js';

const passTimeChallenge = vi.fn();
vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  passTimeChallenge: (...args: any[]) => passTimeChallenge(...args),
}));

const getOrCreate = vi.fn();
vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: { getOrCreate: (...args: any[]) => getOrCreate(...args) },
}));

const { makeNominateGuardians } =
  await import('../../../../src/actions/process/bridge/nominate-guardians.js');
const { BRIDGE_GOVERNANCE, LIQUIDITY_GOVERNANCE } =
  await import('../../../../src/actions/process/bridge/governance.js');
const nominateGuardians = makeNominateGuardians(BRIDGE_GOVERNANCE);

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('nominateGuardians', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    passTimeChallenge.mockReset();
    getOrCreate.mockReset();
    getOrCreate.mockImplementation(async (_tx: any, address: string) =>
      address === 'z1b' ? 2 : 1,
    );
  });

  const run = () =>
    nominateGuardians(
      makeActionContext({
        tx,
        decoded: { guardians: ['z1b', 'z1a'] },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('only starts the time challenge on the first call, hashing the sorted guardians', async () => {
    passTimeChallenge.mockResolvedValue(false);

    await run();

    expect(passTimeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      BRIDGE_GOVERNANCE,
      'NominateGuardians',
      'z1a,z1b',
      BRIDGE_ADMINISTRATOR_DELAY,
    );
    expect(tx).not.toHaveBeenCalled();
  });

  it('replaces the guardians and clears pending administrator votes', async () => {
    passTimeChallenge.mockResolvedValue(true);

    await run();

    expect(argsFor(tx, 'nom_bridge_guardians', 'update')).toEqual([{ revoked_at: CREATED_AT }]);
    expect(argsFor(tx, 'nom_bridge_guardians', 'insert')).toEqual([
      { account_id: 2, nominated_at: CREATED_AT, accepted_at: CREATED_AT },
      { account_id: 1, nominated_at: CREATED_AT, accepted_at: CREATED_AT },
    ]);
    const [votes] = buildersFor(tx, 'nom_bridge_admins');
    expect(votes.whereNull).toHaveBeenCalledWith('accepted_at');
    expect(votes.del).toHaveBeenCalled();
  });

  it('writes the liquidity contract guardians to their own table', async () => {
    passTimeChallenge.mockResolvedValue(true);

    await makeNominateGuardians(LIQUIDITY_GOVERNANCE)(
      makeActionContext({
        tx,
        decoded: { guardians: ['z1b', 'z1a'] },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

    expect(argsFor(tx, 'nom_liquidity_guardians', 'insert')).toHaveLength(2);
    expect(buildersFor(tx, 'nom_liquidity_admins')[0].del).toHaveBeenCalled();
    expect(buildersFor(tx, 'nom_bridge_guardians')).toEqual([]);
  });
});
