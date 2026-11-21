import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { argsFor, buildersFor } from './helpers.js';

const getOrCreate = vi.fn();
vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: { getOrCreate: (...args: any[]) => getOrCreate(...args) },
}));

const { makeProposeAdministrator } =
  await import('../../../../src/actions/process/bridge/propose-administrator.js');
const { BRIDGE_GOVERNANCE, LIQUIDITY_GOVERNANCE } =
  await import('../../../../src/actions/process/bridge/governance.js');
const proposeAdministrator = makeProposeAdministrator(BRIDGE_GOVERNANCE);

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('proposeAdministrator', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(20);
  });

  const run = () =>
    proposeAdministrator(
      makeActionContext({
        tx,
        decoded: { address: 'z1proposed' },
        sendBlock: { accountId: 5 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it("replaces the guardian's previous vote and records no winner below the threshold", async () => {
    tx.resolveNext({}); // delete previous vote
    tx.resolveNext({}); // insert vote
    tx.resolveNext([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]); // 4 guardians, threshold 2
    tx.resolveNext([{ account_id: 20, count: '2' }]);

    await run();

    const [previousVote] = buildersFor(tx, 'nom_bridge_admins');
    expect(previousVote.where).toHaveBeenCalledWith({ nominated_by_id: 5 });
    expect(previousVote.del).toHaveBeenCalled();
    expect(argsFor(tx, 'nom_bridge_admins', 'insert')).toEqual([
      { account_id: 20, nominated_by_id: 5, nominated_at: CREATED_AT },
    ]);
  });

  it('elects the administrator once more than half of the guardians vote for it', async () => {
    tx.resolveNext({});
    tx.resolveNext({});
    tx.resolveNext([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    tx.resolveNext([{ account_id: 20, count: '3' }]);

    await run();

    expect(argsFor(tx, 'nom_bridge_admins', 'update')).toEqual([{ revoked_at: CREATED_AT }]);
    expect(argsFor(tx, 'nom_bridge_admins', 'insert')).toEqual([
      { account_id: 20, nominated_by_id: 5, nominated_at: CREATED_AT },
      { account_id: 20, accepted_at: CREATED_AT },
    ]);
  });

  it('counts liquidity guardian votes in the liquidity tables', async () => {
    tx.resolveNext({});
    tx.resolveNext({});
    tx.resolveNext([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]); // threshold 2
    tx.resolveNext([{ account_id: 20, count: '3' }]);

    await makeProposeAdministrator(LIQUIDITY_GOVERNANCE)(
      makeActionContext({
        tx,
        decoded: { address: 'z1proposed' },
        sendBlock: { accountId: 5 },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

    expect(argsFor(tx, 'nom_liquidity_admins', 'insert')).toEqual([
      { account_id: 20, nominated_by_id: 5, nominated_at: CREATED_AT },
      { account_id: 20, accepted_at: CREATED_AT },
    ]);
    expect(buildersFor(tx, 'nom_liquidity_guardians')).toHaveLength(1);
    expect(buildersFor(tx, 'nom_bridge_admins')).toEqual([]);
  });
});
