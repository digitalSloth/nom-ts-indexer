import { describe, it, expect } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { donate } = await import('../../../../src/actions/process/accelerator/donate.js');

describe('donate', () => {
  it('is a no-op (does not throw, does not call tx)', async () => {
    const tx = makeMockTx();
    const ctx = makeActionContext({ tx });
    await donate(ctx);

    // Donate is a no-op — no DB writes.
    expect(tx).not.toHaveBeenCalled();
  });
});
