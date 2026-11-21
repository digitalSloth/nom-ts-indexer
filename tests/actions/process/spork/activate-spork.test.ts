import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { activateSpork } = await import('../../../../src/actions/process/spork/activate-spork.js');

describe('activateSpork', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  // Mainnet: the HTLC spork was activated with frontier momentum 4188193 and
  // enforced from 4188199.
  it('activates the spork six momentums after the frontier', async () => {
    tx.resolveNext({ id: 3 }); // spork lookup
    tx.resolveNext({}); // update

    const ctx = makeActionContext({
      tx,
      frontierMomentum: { height: 4188193n },
      receiveBlock: { createdAt: new Date('2023-03-01T00:00:00Z') },
      decoded: { id: '0xCEB7E380' },
    });
    await activateSpork(ctx);

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({ hash: 'ceb7e380' });
    const update = tx.mock.results[1].value;
    expect(update.where).toHaveBeenCalledWith({ id: 3 });
    expect(update.update).toHaveBeenCalledWith({
      is_active: true,
      enforcement_height: '4188199',
      activated_at: new Date('2023-03-01T00:00:00Z'),
    });
  });

  it('throws when the spork is not indexed', async () => {
    tx.resolveNext(null); // spork lookup

    const ctx = makeActionContext({ tx, decoded: { id: '0xabcd' } });
    await expect(activateSpork(ctx)).rejects.toThrow(
      'Spork.ActivateSpork: spork not found for abcd',
    );
  });
});
