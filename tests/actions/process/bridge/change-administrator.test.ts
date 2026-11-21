import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';
import { BRIDGE_ADMINISTRATOR_DELAY } from '../../../../src/constants/zenon.js';
import { argsFor } from './helpers.js';

const passTimeChallenge = vi.fn();
vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  passTimeChallenge: (...args: any[]) => passTimeChallenge(...args),
}));

const getOrCreate = vi.fn();
vi.mock('../../../../src/services/registries/account-registry.js', () => ({
  accountRegistry: { getOrCreate: (...args: any[]) => getOrCreate(...args) },
}));

const { makeChangeAdministrator } =
  await import('../../../../src/actions/process/bridge/change-administrator.js');
const { BRIDGE_GOVERNANCE, LIQUIDITY_GOVERNANCE } =
  await import('../../../../src/actions/process/bridge/governance.js');
const changeAdministrator = makeChangeAdministrator(BRIDGE_GOVERNANCE);

const CREATED_AT = new Date('2024-01-01T00:00:00Z');

describe('changeAdministrator', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    passTimeChallenge.mockReset();
    getOrCreate.mockReset();
    getOrCreate.mockResolvedValue(8);
  });

  const run = () =>
    changeAdministrator(
      makeActionContext({
        tx,
        decoded: { administrator: 'z1newadmin' },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

  it('only starts the time challenge on the first call', async () => {
    passTimeChallenge.mockResolvedValue(false);

    await run();

    expect(passTimeChallenge).toHaveBeenCalledWith(
      expect.anything(),
      BRIDGE_GOVERNANCE,
      'ChangeAdministrator',
      'z1newadmin',
      BRIDGE_ADMINISTRATOR_DELAY,
    );
    expect(tx).not.toHaveBeenCalled();
  });

  it('revokes the current administrator and accepts the new one', async () => {
    passTimeChallenge.mockResolvedValue(true);

    await run();

    expect(argsFor(tx, 'nom_bridge_admins', 'update')).toEqual([{ revoked_at: CREATED_AT }]);
    expect(argsFor(tx, 'nom_bridge_admins', 'insert')).toEqual([
      { account_id: 8, accepted_at: CREATED_AT },
    ]);
  });

  it('writes the liquidity contract administrators to their own table', async () => {
    passTimeChallenge.mockResolvedValue(true);

    await makeChangeAdministrator(LIQUIDITY_GOVERNANCE)(
      makeActionContext({
        tx,
        decoded: { administrator: 'z1newadmin' },
        receiveBlock: { createdAt: CREATED_AT },
      }),
    );

    expect(passTimeChallenge.mock.calls[0][1]).toBe(LIQUIDITY_GOVERNANCE);
    expect(argsFor(tx, 'nom_liquidity_admins', 'insert')).toEqual([
      { account_id: 8, accepted_at: CREATED_AT },
    ]);
    expect(argsFor(tx, 'nom_bridge_admins', 'insert')).toEqual([]);
  });
});
