import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeMockTx } from '../../../helpers/mock-action-context.js';

const { checkTimeChallenge, assertNoActiveChallenge } = await import('../../../../src/actions/process/bridge/time-challenge.js');

describe('checkTimeChallenge', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('returns inactive when contract method not found', async () => {
    tx.resolveNext(null);  // contract method lookup

    const result = await checkTimeChallenge(tx, 'SetTokenPair', '{}', 100, BigInt(50), new Date());

    expect(result).toEqual({ isActive: false });
  });

  it('creates new challenge and returns active', async () => {
    tx.resolveNext({ id: 1 });  // contract method lookup
    tx.resolveNext(null);        // time challenge lookup (not found)
    tx.resolveNext({});          // insert challenge

    const result = await checkTimeChallenge(tx, 'SetTokenPair', '{}', 100, BigInt(50), new Date('2024-01-01'));

    expect(result).toEqual({ isActive: true });
  });

  it('returns active when challenge not expired', async () => {
    tx.resolveNext({ id: 1 });  // contract method lookup
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update('{}').digest('hex');
    tx.resolveNext({              // time challenge lookup
      id: 10,
      hash,
      start_height: BigInt(50),
      end_height: BigInt(150),
    });

    const result = await checkTimeChallenge(tx, 'SetTokenPair', '{}', 100, BigInt(100), new Date());

    expect(result).toEqual({ isActive: true });
  });

  it('returns inactive when challenge expired', async () => {
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update('{}').digest('hex');
    tx.resolveNext({ id: 1 });  // contract method lookup
    tx.resolveNext({              // time challenge lookup
      id: 10,
      hash,
      start_height: BigInt(50),
      end_height: BigInt(150),
    });
    tx.resolveNext({});          // update (deactivate)

    // momentumHeight (200) >= end_height (150) → expired
    const result = await checkTimeChallenge(tx, 'SetTokenPair', '{}', 100, BigInt(200), new Date());

    expect(result).toEqual({ isActive: false });
  });

  it('resets challenge when hash changes', async () => {
    tx.resolveNext({ id: 1 });  // contract method lookup
    tx.resolveNext({              // time challenge lookup
      id: 10,
      hash: 'oldhash',
      start_height: BigInt(50),
      end_height: BigInt(150),
    });
    tx.resolveNext({});          // update (reset)

    const result = await checkTimeChallenge(tx, 'SetTokenPair', '{"new":"data"}', 100, BigInt(200), new Date());

    expect(result).toEqual({ isActive: true });
  });
});

describe('assertNoActiveChallenge', () => {
  let tx: ReturnType<typeof makeMockTx>;

  beforeEach(() => {
    tx = makeMockTx();
  });

  it('returns true when momentum not found', async () => {
    tx.resolveNext(null);  // momentum lookup

    const result = await assertNoActiveChallenge(tx, { momentumId: 1 }, 'SetTokenPair', '{}', 100);

    expect(result).toBe(true);
  });

  it('returns true when challenge is not active', async () => {
    tx.resolveNext({ height: BigInt(200), created_at: new Date() }); // momentum
    tx.resolveNext({ id: 1 });  // contract method
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update('{}').digest('hex');
    tx.resolveNext({              // time challenge (expired)
      id: 10,
      hash,
      start_height: BigInt(50),
      end_height: BigInt(150),
    });
    tx.resolveNext({});          // update (deactivate)

    const result = await assertNoActiveChallenge(tx, { momentumId: 1 }, 'SetTokenPair', '{}', 100);

    expect(result).toBe(true);
  });

  it('returns false and warns when challenge is active', async () => {
    tx.resolveNext({ height: BigInt(100), created_at: new Date() }); // momentum
    tx.resolveNext({ id: 1 });  // contract method
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update('{}').digest('hex');
    tx.resolveNext({              // time challenge (still active)
      id: 10,
      hash,
      start_height: BigInt(50),
      end_height: BigInt(150),
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await assertNoActiveChallenge(tx, { momentumId: 1 }, 'SetTokenPair', '{}', 100);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('time challenge'));
    warnSpy.mockRestore();
  });
});
