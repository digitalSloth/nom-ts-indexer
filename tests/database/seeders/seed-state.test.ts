import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockTx } from '../../helpers/mock-action-context.js';
import { markSeeded, seedState } from '../../../src/database/seeders/seed-state.js';

describe('seedState', () => {
  let db: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    db = makeMockTx();
  });

  it('reports seeded when the marker is set', async () => {
    db.resolveNext({ seeded_at: new Date() });
    expect(await seedState(db)).toBe('seeded');
  });

  it('reports empty when there is no marker and no rows', async () => {
    db.resolveNext(null);
    db.resolveNext(null);
    expect(await seedState(db)).toBe('empty');
  });

  it('reports empty when the state row exists without a marker and no rows', async () => {
    db.resolveNext({ seeded_at: null });
    db.resolveNext(null);
    expect(await seedState(db)).toBe('empty');
  });

  it('reports partial when rows exist without the marker', async () => {
    db.resolveNext({ seeded_at: null });
    db.resolveNext({ id: 1 });
    expect(await seedState(db)).toBe('partial');
  });
});

describe('markSeeded', () => {
  let db: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    db = makeMockTx();
  });

  it('sets the marker on the existing state row', async () => {
    db.resolveNext({ id: 7 });
    db.resolveNext({});
    await markSeeded(db);

    const updateQuery = db.mock.results[1].value;
    expect(updateQuery.where).toHaveBeenCalledWith({ id: 7 });
    expect(updateQuery.update).toHaveBeenCalledWith({ seeded_at: expect.any(Date) });
  });

  it('creates the state row with the marker when none exists', async () => {
    db.resolveNext(null);
    db.resolveNext({});
    await markSeeded(db);

    const insertQuery = db.mock.results[1].value;
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({ last_indexed_momentum: 0, seeded_at: expect.any(Date) }),
    );
  });
});
