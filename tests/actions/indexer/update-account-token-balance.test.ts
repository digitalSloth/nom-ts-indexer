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
});
