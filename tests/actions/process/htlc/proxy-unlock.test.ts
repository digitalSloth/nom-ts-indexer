import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { allowProxyUnlock, denyProxyUnlock } =
  await import('../../../../src/actions/process/htlc/proxy-unlock.js');

describe('proxy unlock', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('denies proxy unlocks for the sender', async () => {
    await denyProxyUnlock(makeActionContext({ tx, sendBlock: { accountId: 7 } }));

    expect(tx).toHaveBeenCalledWith('nom_accounts');
    const update = tx.mock.results[0].value;
    expect(update.where).toHaveBeenCalledWith({ id: 7 });
    expect(update.update).toHaveBeenCalledWith({ is_htlc_proxy_unlock_allowed: false });
  });

  it('allows proxy unlocks for the sender', async () => {
    await allowProxyUnlock(makeActionContext({ tx, sendBlock: { accountId: 7 } }));

    expect(tx.mock.results[0].value.update).toHaveBeenCalledWith({
      is_htlc_proxy_unlock_allowed: true,
    });
  });
});
