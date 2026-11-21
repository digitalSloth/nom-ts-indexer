import { describe, it, expect, beforeEach } from 'vitest';
import { makeActionContext, makeMockTx } from '../../../helpers/mock-action-context.js';

const { addPhase } = await import('../../../../src/actions/process/accelerator/add-phase.js');

describe('addPhase', () => {
  let tx: ReturnType<typeof makeMockTx>;

  const defaultDecoded = {
    // Decoded hash args are 0x-prefixed; rows store bare hex
    id: '0xprojecthash123',
    name: 'Phase 1',
    description: 'First phase',
    url: 'https://example.com',
    znnFundsNeeded: '500000000',
    qsrFundsNeeded: '2500000000',
  };

  function phaseInsert() {
    const builder = tx.mock.results
      .map((r: any) => r.value)
      .find((b: any) => b.insert.mock.calls.length);
    return builder.insert.mock.calls[0][0];
  }

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('creates the first phase of a project', async () => {
    tx.resolveNext({ id: 1 }); // project
    tx.resolveNext(null); // no phases yet

    await addPhase(makeActionContext({ tx, decoded: defaultDecoded }));

    expect(phaseInsert()).toMatchObject({
      project_id: 1,
      hash: 'sendblockhash123',
      name: 'Phase 1',
      status: 0,
      phase_number: 1,
      znn_requested: 500000000n,
      qsr_requested: 2500000000n,
    });
  });

  it('numbers the phase after the latest one', async () => {
    tx.resolveNext({ id: 1 });
    tx.resolveNext({ phase_number: 3 });

    await addPhase(makeActionContext({ tx, decoded: defaultDecoded }));

    expect(phaseInsert()).toMatchObject({ phase_number: 4 });
  });

  it('throws when the project is not indexed', async () => {
    tx.resolveNext(null);

    await expect(addPhase(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow(
      'Accelerator.AddPhase: project not found for hash projecthash123',
    );
  });

  it('looks up the project by its bare hash', async () => {
    tx.resolveNext(null);

    await expect(addPhase(makeActionContext({ tx, decoded: defaultDecoded }))).rejects.toThrow();

    expect(tx.mock.results[0].value.where).toHaveBeenCalledWith({ hash: 'projecthash123' });
  });
});
