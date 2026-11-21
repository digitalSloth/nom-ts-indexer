import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { createProject } =
  await import('../../../../src/actions/process/accelerator/create-project.js');

describe('createProject', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    name: 'Test Project',
    description: 'A test project',
    url: 'https://example.com',
    znnFundsNeeded: '1000000000',
    qsrFundsNeeded: '5000000000',
  };

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('inserts a voting project keyed by the send block hash', async () => {
    const ctx = makeActionContext({ tx, decoded: defaultDecoded });
    await createProject(ctx);

    const builder = tx.mock.results[0].value;
    expect(tx).toHaveBeenCalledWith('nom_accelerator_projects');
    expect(builder.insert).toHaveBeenCalledWith({
      owner_id: 1,
      hash: 'sendblockhash123',
      name: 'Test Project',
      slug: 'test-project',
      url: 'https://example.com',
      description: 'A test project',
      status: 0,
      znn_requested: 1000000000n,
      qsr_requested: 5000000000n,
      znn_remaining: 1000000000n,
      qsr_remaining: 5000000000n,
      created_at: new Date('2024-01-01T00:00:00Z'),
    });
  });
});
