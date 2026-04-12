import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { undelegate } = await import('../../../../src/actions/process/pillar/undelegate.js');

describe('undelegate', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('ends all active delegations for the sender', async () => {
    tx.resolveNext({}); // update

    const ctx = makeActionContext({ tx });
    await expect(undelegate(ctx)).resolves.toBeUndefined();
  });

  it('does nothing if no active delegations', async () => {
    tx.resolveNext({}); // update (returns empty result)

    const ctx = makeActionContext({ tx });
    await expect(undelegate(ctx)).resolves.toBeUndefined();
  });
});
