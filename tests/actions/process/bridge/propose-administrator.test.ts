import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { proposeAdministrator } = await import('../../../../src/actions/process/bridge/propose-administrator.js');

describe('proposeAdministrator', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates nomination', async () => {
    tx.resolveNext({ id: 1 });          // guardian lookup
    tx.resolveNext({ id: 50 });         // proposed account lookup
    tx.resolveNext({});                  // insert nomination
    tx.resolveNext([{ id: 1 }, { id: 2 }, { id: 3 }]); // active guardians (array)
    tx.resolveNext([]);                  // groupBy nominations (no majority)

    const ctx = makeActionContext({
      tx,
      decoded: { address: 'z1qproposed' },
    });
    await expect(proposeAdministrator(ctx)).resolves.toBeUndefined();
  });

  it('executes majority vote and promotes winner', async () => {
    tx.resolveNext({ id: 1 });          // guardian lookup
    tx.resolveNext({ id: 50 });         // proposed account lookup
    tx.resolveNext({});                  // insert nomination
    tx.resolveNext([{ id: 1 }, { id: 2 }, { id: 3 }]); // active guardians
    tx.resolveNext([{ account_id: 50, count: 2 }]); // nominations with majority
    tx.resolveNext({});                  // del pending
    tx.resolveNext({});                  // revoke current admin
    tx.resolveNext({});                  // insert new admin

    const ctx = makeActionContext({
      tx,
      decoded: { address: 'z1qproposed' },
    });
    await expect(proposeAdministrator(ctx)).resolves.toBeUndefined();
  });

  it('throws on missing address', async () => {
    const ctx = makeActionContext({ tx, decoded: {} });
    await expect(proposeAdministrator(ctx)).rejects.toThrow('missing required field');
  });

  it('warns if sender is not guardian', async () => {
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { address: 'z1qproposed' } });
    await proposeAdministrator(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not an active guardian'));
  });

  it('warns if proposed account not found', async () => {
    tx.resolveNext({ id: 1 });
    tx.resolveNext(null);
    const warnSpy = vi.spyOn(console, 'warn');

    const ctx = makeActionContext({ tx, decoded: { address: 'z1qproposed' } });
    await proposeAdministrator(ctx);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('account not found'));
  });

  it('does not promote without majority', async () => {
    tx.resolveNext({ id: 1 });
    tx.resolveNext({ id: 50 });
    tx.resolveNext({});
    tx.resolveNext([{ id: 1 }, { id: 2 }, { id: 3 }]);
    tx.resolveNext([{ account_id: 50, count: 1 }]); // only 1 vote, need > 1

    const ctx = makeActionContext({
      tx,
      decoded: { address: 'z1qproposed' },
    });
    await expect(proposeAdministrator(ctx)).resolves.toBeUndefined();
  });
});
