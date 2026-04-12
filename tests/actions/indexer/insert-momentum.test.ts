import { describe, it, expect, beforeEach, vi } from 'vitest';
import { accountRegistry } from '../../../src/services/registries/account-registry.js';
import { pillarRegistry } from '../../../src/services/registries/pillar-registry.js';
import { makeMockKnex, type MockKnex } from '../../helpers/mock-knex.js';
import { makeMockMomentum } from '../../helpers/mock-zenon.js';

let insertMomentum: typeof import('../../../src/actions/indexer/insert-momentum.js').insertMomentum;

describe('insertMomentum', () => {
  let tx: MockKnex;

  beforeEach(async () => {
    vi.resetModules();
    ({ insertMomentum } = await import('../../../src/actions/indexer/insert-momentum.js'));
    tx = makeMockKnex();
    accountRegistry.clear();
    pillarRegistry.clear();
  });

  it('upserts momentum with pillar resolved from registry', async () => {
    pillarRegistry.setPillarId(50, 7);
    tx.resolveNext({ id: 50 }); // accountRegistry.getOrCreate
    tx.resolveNext({ id: 100 }); // the insert

    const m = makeMockMomentum({
      height: 12345,
      hash: { toString: () => 'h_a' },
      producer: { toString: () => 'z1prod' },
      timestamp: 1700000000,
      version: 2,
      data: null,
    });

    const result = await insertMomentum(tx, m);

    expect(result).toEqual({
      momentumId: 100,
      height: 12345n,
      hash: 'h_a',
      timestamp: 1700000000,
    });
    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    expect(builder.onConflict).toHaveBeenCalled();
    expect(builder.returning).toHaveBeenCalled();
  });

  it('sets producerPillarId to null when no registry entry', async () => {
    tx.resolveNext({ id: 50 }); // accountRegistry.getOrCreate
    tx.resolveNext({ id: 1 }); // the insert

    await insertMomentum(tx, makeMockMomentum());

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    expect(builder.onConflict).toHaveBeenCalled();
  });

  it('encodes data as base64 when provided', async () => {
    tx.resolveNext({ id: 50 }); // accountRegistry.getOrCreate
    tx.resolveNext({ id: 1 }); // the insert

    const data = Buffer.from('hello');
    const m = makeMockMomentum({ data });
    await insertMomentum(tx, m);

    const builder = tx.lastBuilder();
    expect(builder.insert).toHaveBeenCalled();
    const insertCall = (builder.insert as any).mock.calls[0][0];
    expect(insertCall.data).toBe(data.toString('base64'));
  });
});
