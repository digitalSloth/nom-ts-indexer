import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { reclaim, reclaimWithSignature } =
  await import('../../../../src/actions/process/ptlc/reclaim.js');

describe('ptlc reclaim', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  for (const [name, handler] of [
    ['Reclaim', reclaim],
    ['ReclaimWithSignature', reclaimWithSignature],
  ] as const) {
    it(`${name} marks the open PTLC reclaimed`, async () => {
      tx.resolveNext({ id: 9 }); // open PTLC lookup
      tx.resolveNext({}); // update

      const ctx = makeActionContext({
        tx,
        sendBlock: { id: 45 },
        receiveBlock: { createdAt: new Date('2024-02-01T00:00:00Z') },
        decoded: { id: '0xabcd', signature: '0x01' },
      });
      await handler(ctx);

      const update = tx.mock.results[1].value;
      expect(update.where).toHaveBeenCalledWith({ id: 9 });
      expect(update.update).toHaveBeenCalledWith({
        reclaim_account_block_id: 45,
        reclaimed_at: new Date('2024-02-01T00:00:00Z'),
        ...(name === 'ReclaimWithSignature' && { reclaim_signature: '01' }),
      });
    });

    it(`${name} throws when no open PTLC exists for the id`, async () => {
      tx.resolveNext(null);

      const ctx = makeActionContext({ tx, decoded: { id: '0xabcd' } });
      await expect(handler(ctx)).rejects.toThrow(`Ptlc.${name}: open PTLC not found for abcd`);
    });
  }
});
