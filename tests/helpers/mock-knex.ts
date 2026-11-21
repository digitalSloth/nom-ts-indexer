import { vi } from 'vitest';

/**
 * Creates a mock knex instance that supports the function-call pattern
 * `db('table_name').where(...).first()` etc.
 *
 * The returned object is both a callable function and has top-level methods
 * like `.raw()`, `.transaction()`, `.destroy()`.
 *
 * Each call to `db('table')` returns a fresh chainable builder.  Use
 * `mockDb.resolveNext(value)` to queue values in a FIFO queue consumed
 * by terminal methods (`.first()`, `.then()`).
 */

export interface MockKnexBuilder {
  where: MockKnexBuilder;
  andWhere: MockKnexBuilder;
  orWhere: MockKnexBuilder;
  whereIn: MockKnexBuilder;
  whereNotIn: MockKnexBuilder;
  whereNull: MockKnexBuilder;
  whereNotNull: MockKnexBuilder;
  leftJoin: MockKnexBuilder;
  innerJoin: MockKnexBuilder;
  rightJoin: MockKnexBuilder;
  select: MockKnexBuilder;
  orderBy: MockKnexBuilder;
  limit: MockKnexBuilder;
  offset: MockKnexBuilder;
  groupBy: MockKnexBuilder;
  having: MockKnexBuilder;
  count: MockKnexBuilder;
  max: MockKnexBuilder;
  min: MockKnexBuilder;
  sum: MockKnexBuilder;
  insert: MockKnexBuilder;
  update: MockKnexBuilder;
  del: MockKnexBuilder;
  delete: MockKnexBuilder;
  returning: MockKnexBuilder;
  onConflict: MockKnexBuilder;
  merge: MockKnexBuilder;
  first: ReturnType<typeof vi.fn>;
  then: (resolve: (value: any) => any, reject?: (reason: any) => any) => Promise<any>;
}

export interface MockKnex {
  (table: string): MockKnexBuilder;
  raw: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  migrate: {
    latest: ReturnType<typeof vi.fn>;
    rollback: ReturnType<typeof vi.fn>;
  };
  /** Queue a resolved value (FIFO) for terminal methods. */
  resolveNext: (value: any) => void;
  /** Set per-table default return value. */
  tables: Record<string, any>;
  /** Access the last builder created by db('table') calls. */
  lastBuilder: () => MockKnexBuilder;
}

function makeBuilder(resolveQueue: () => any): MockKnexBuilder {
  const builder: any = {};

  const chainMethods = [
    'where',
    'andWhere',
    'orWhere',
    'whereIn',
    'whereNotIn',
    'whereNull',
    'whereNotNull',
    'leftJoin',
    'innerJoin',
    'rightJoin',
    'select',
    'orderBy',
    'limit',
    'offset',
    'groupBy',
    'having',
    'count',
    'max',
    'min',
    'sum',
    'insert',
    'update',
    'del',
    'delete',
    'returning',
    'onConflict',
    'merge',
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }

  builder.first = vi.fn(() => {
    const val = resolveQueue();
    return Promise.resolve(val ?? null);
  });

  builder.then = function (resolve: any, reject?: any) {
    try {
      const val = resolveQueue();
      // Always return an array from `then` — knex `.returning()` returns arrays.
      // Select queries use `.first()` which bypasses `then` and returns a single object.
      const result = Array.isArray(val) ? val : val != null ? [val] : [];
      return Promise.resolve(result).then(resolve, reject);
    } catch (err) {
      if (reject) return Promise.reject(err).then(resolve, reject);
      return Promise.reject(err);
    }
  };

  return builder as MockKnexBuilder;
}

export function makeMockKnex(): MockKnex {
  const queue: any[] = [];
  let lastBuilder: MockKnexBuilder | null = null;
  const tableDefaults: Record<string, any> = {};

  const dequeue = () => {
    if (queue.length > 0) {
      return queue.shift();
    }
    return undefined;
  };

  function db(table: string): MockKnexBuilder {
    lastBuilder = makeBuilder(() => {
      return dequeue() ?? tableDefaults[table] ?? null;
    });
    return lastBuilder;
  }

  const mockDb = db as MockKnex;

  mockDb.raw = vi.fn(async () => ({ rows: [] }));
  mockDb.transaction = vi.fn(async (fn: any) => {
    return fn(mockDb);
  });
  mockDb.destroy = vi.fn(async () => {});
  mockDb.migrate = {
    latest: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  };

  mockDb.resolveNext = (value: any) => {
    queue.push(value);
  };
  mockDb.tables = tableDefaults;
  mockDb.lastBuilder = () => lastBuilder!;

  return mockDb;
}
