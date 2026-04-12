import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

vi.mock('../../../../src/actions/process/bridge/time-challenge.js', () => ({
  checkTimeChallenge: vi.fn(async () => ({ isActive: false })),
  assertNoActiveChallenge: vi.fn(async () => true),
}));

const { nominateGuardians } = await import('../../../../src/actions/process/bridge/nominate-guardians.js');
const { checkTimeChallenge, assertNoActiveChallenge } = await import('../../../../src/actions/process/bridge/time-challenge.js');

describe('nominateGuardians', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
    vi.mocked(checkTimeChallenge).mockReset();
    vi.mocked(checkTimeChallenge).mockResolvedValue({ isActive: false });
    vi.mocked(assertNoActiveChallenge).mockReset();
    vi.mocked(assertNoActiveChallenge).mockResolvedValue(true);
  });

  it('revokes existing and creates new guardians', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({});                 // revoke all guardians
    tx.resolveNext({ id: 10 });        // account lookup for z1addr1
    tx.resolveNext({});                 // insert guardian 1
    tx.resolveNext({ id: 11 });        // account lookup for z1addr2
    tx.resolveNext({});                 // insert guardian 2

    const ctx = makeActionContext({
      tx,
      decoded: { guardians: ['z1addr1', 'z1addr2'] },
    });
    await expect(nominateGuardians(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing guardians', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(nominateGuardians(ctx)).rejects.toThrow('missing or empty');
  });

  it('throws on empty guardians array', async () => {
    const ctx = makeActionContext({ tx, decoded: { guardians: [] } });
    await expect(nominateGuardians(ctx)).rejects.toThrow('missing or empty');
  });

  it('warns if sender is not admin', async () => {
    tx.resolveNext({ account_id: 999 });
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { guardians: ['z1addr'] } });
    await nominateGuardians(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not bridge admin'));
  });

  it('skips unknown guardian addresses', async () => {
    tx.resolveNext({ account_id: 1 });  // getActiveAdminAccountId
    tx.resolveNext({});                 // revoke all guardians
    tx.resolveNext(null);               // first address not found
    tx.resolveNext({ id: 10 });        // second address found
    tx.resolveNext({});                 // insert guardian
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({
      tx,
      decoded: { guardians: ['z1unknown', 'z1known'] },
    });
    await nominateGuardians(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('account not found'));
  });

  it('skips if time challenge active', async () => {
    tx.resolveNext({ account_id: 1 });
    vi.mocked(assertNoActiveChallenge).mockResolvedValue(false);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { guardians: ['z1addr'] } });
    await nominateGuardians(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('time challenge'));
  });
});
