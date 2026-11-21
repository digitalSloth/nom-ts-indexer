import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { register } = await import('../../../../src/actions/process/sentinel/register.js');

describe('sentinel register', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates a sentinel record and takes 50,000 QSR from the deposit', async () => {
    tx.resolveNext({}); // insert
    tx.resolveNext({ id: 7, amount: '6000000000000' }); // deposit lookup
    tx.resolveNext({}); // deposit update

    const ctx = makeActionContext({ tx });
    await register(ctx);

    expect(tx.mock.results[0].value.insert).toHaveBeenCalledWith({
      owner_id: 1,
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
    expect(tx.mock.results[1].value.where).toHaveBeenCalledWith({
      account_id: 1,
      contract_account_id: 2,
    });
    expect(tx.mock.results[2].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '1000000000000' }),
    );
  });
});
