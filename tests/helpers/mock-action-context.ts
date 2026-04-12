import { vi } from 'vitest';
import type { ActionContext, KnexTransactionClient } from '../../../src/actions/process/types.js';

/**
 * Creates a mock knex transaction that supports the `tx('table').where().first()` pattern.
 */
export function makeMockTx(): any {
  const queue: any[] = [];

  function dequeue() {
    if (queue.length > 0) {
      return queue.shift();
    }
    return null;
  }

  function makeBuilder() {
    const builder: any = {};

    const chainMethods = [
      'where', 'andWhere', 'orWhere', 'whereIn', 'whereNotIn',
      'whereNull', 'whereNotNull',
      'leftJoin', 'innerJoin', 'rightJoin', 'join',
      'select', 'orderBy', 'limit', 'offset', 'groupBy', 'having',
      'count', 'max', 'min', 'sum',
      'insert', 'update', 'del', 'delete',
      'returning', 'onConflict', 'merge',
    ];

    for (const method of chainMethods) {
      builder[method] = vi.fn(() => builder);
    }

    // Return a thenable so queue consumption is deferred until .then() is called.
    // This is important for Promise.all ordering — if first() returned a real
    // Promise, it would consume from the queue at construction time (before
    // Promise.all processes the thenables), causing wrong value ordering.
    builder.first = vi.fn(() => ({
      then(resolve: any, reject?: any) {
        try {
          return Promise.resolve(dequeue()).then(resolve, reject);
        } catch (err) {
          if (reject) return Promise.reject(err).then(resolve, reject);
          return Promise.reject(err);
        }
      },
    }));
    builder.then = function (resolve: any, reject?: any) {
      try {
        const val = dequeue();
        // Always return an array from `then` — knex `.returning()` returns arrays.
        // Select queries use `.first()` which bypasses `then` and returns a single object.
        const result = Array.isArray(val) ? val : (val != null ? [val] : []);
        return Promise.resolve(result).then(resolve, reject);
      } catch (err) {
        if (reject) return Promise.reject(err).then(resolve, reject);
        return Promise.reject(err);
      }
    };

    return builder;
  }

  const tx: any = vi.fn(() => makeBuilder());

  tx.resolveNext = (value: any) => {
    queue.push(value);
  };
  tx.resetResolutions = () => {
    queue.length = 0;
  };
  tx.raw = vi.fn(async () => ({ rows: [] }));

  return tx;
}

/**
 * Creates a mock ActionContext with sensible defaults.
 */
export function makeActionContext(overrides: {
  tx?: any;
  receiveBlock?: Partial<ActionContext['receiveBlock']>;
  sendBlock?: Partial<ActionContext['sendBlock']>;
  decoded?: Record<string, any>;
} = {}): ActionContext {
  return {
    tx: overrides.tx ?? makeMockTx(),
    receiveBlock: {
      id: 1,
      momentumId: 100,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      ...overrides.receiveBlock,
    },
    sendBlock: {
      id: 10,
      accountId: 1,
      toAccountId: 2,
      tokenId: 1,
      amount: '100000000',
      hash: 'sendblockhash123',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      sdk: {} as any,
      ...overrides.sendBlock,
    },
    decoded: overrides.decoded ?? {},
  };
}
