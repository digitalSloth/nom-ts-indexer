import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  checkTimeChallenge: vi.fn(async () => ({ isActive: false })),
  assertNoActiveChallenge: vi.fn(async () => true),
}));

const { changeAdministrator } = await import('../../../../src/actions/process/bridge/change-administrator.js');
const { checkTimeChallenge, assertNoActiveChallenge } = await import('../../../../src/actions/process/bridge/time-challenge.js');

describe('changeAdministrator', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    vi.mocked(checkTimeChallenge).mockReset();
    vi.mocked(checkTimeChallenge).mockResolvedValue({ isActive: false });
    vi.mocked(assertNoActiveChallenge).mockReset();
    vi.mocked(assertNoActiveChallenge).mockResolvedValue(true);
  });

  it('changes admin after time challenge', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({ id: 50 });        // new admin account lookup
    tx.resolveNext({});                 // del pending
    tx.resolveNext({});                 // revoke current admin
    tx.resolveNext({});                 // insert new admin

    const ctx = makeActionContext({
      tx,
      decoded: { administrator: 'z1qnewadmin' },
    });
    await expect(changeAdministrator(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing administrator', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(changeAdministrator(ctx)).rejects.toThrow('missing required field');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { administrator: 'z1qnewadmin' } });
    await changeAdministrator(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('skips if time challenge active', async () => {
    tx.resolveNext({ account_id: 1 });
    vi.mocked(assertNoActiveChallenge).mockResolvedValue(false);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { administrator: 'z1qnewadmin' } });
    await changeAdministrator(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('time challenge'));
  });

  it('warns if new admin account not found', async () => {
    tx.resolveNext({ account_id: 1 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { administrator: 'z1qnewadmin' } });
    await changeAdministrator(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('account not found'));
  });
});
