import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';
import { updateAccountTokenBalance } from '../../../src/actions/indexer/update-account-token-balance.js';

describe('updateAccountTokenBalance', () => {
  let tx: MockKnex;

  beforeEach(() => {
    tx = makeMockKnex();
  });

  it('creates a new row when no existing balance', async () => {
    tx.resolveNext(null); // no existing row

    await updateAccountTokenBalance(tx, 1, 5, 100n);

    // The second call is the insert — check it was issued
    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall.account_id).toBe(1);
    expect(insertCall.token_id).toBe(5);
    expect(insertCall.balance).toBe('100');
  });

  it('adds to existing balance', async () => {
    tx.resolveNext({ balance: '50' }); // existing row

    await updateAccountTokenBalance(tx, 1, 5, 100n);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall.balance).toBe('150');
  });

  it('subtracts from existing balance', async () => {
    tx.resolveNext({ balance: '200' }); // existing row

    await updateAccountTokenBalance(tx, 1, 5, -50n);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall.balance).toBe('150');
  });

  it('handles negative delta with no existing row', async () => {
    tx.resolveNext(null); // no existing row

    await updateAccountTokenBalance(tx, 1, 5, -100n);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall.balance).toBe('-100');
  });

  it('uses onConflict merge for upsert', async () => {
    tx.resolveNext({ balance: '0' });

    await updateAccountTokenBalance(tx, 1, 5, 10n);

    const builder = tx.lastBuilder();
    expect(builder.onConflict).toHaveBeenCalledWith(['account_id', 'token_id']);
    expect(builder.merge).toHaveBeenCalled();
  });

  it('adds a positive delta to received and leaves sent unchanged', async () => {
    tx.resolveNext({ balance: '50', sent: '30', received: '80' });

    await updateAccountTokenBalance(tx, 1, 5, 100n);

    const builder = tx.lastBuilder();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall).toMatchObject({ balance: '150', sent: '30', received: '180' });
    expect(builder.merge).toHaveBeenCalledWith(
      expect.objectContaining({ balance: '150', sent: '30', received: '180' }),
    );
  });

  it('adds the size of a negative delta to sent and leaves received unchanged', async () => {
    tx.resolveNext({ balance: '200', sent: '0', received: '200' });

    await updateAccountTokenBalance(tx, 1, 5, -50n);

    const builder = tx.lastBuilder();
    expect(builder.merge).toHaveBeenCalledWith(
      expect.objectContaining({ balance: '150', sent: '50', received: '200' }),
    );
  });

  it('starts totals from zero when no row exists', async () => {
    tx.resolveNext(null);

    await updateAccountTokenBalance(tx, 1, 5, -100n);

    const insertCall = (tx.lastBuilder().insert as any).mock.calls[0][0];
    expect(insertCall).toMatchObject({ balance: '-100', sent: '100', received: '0' });
  });
});
