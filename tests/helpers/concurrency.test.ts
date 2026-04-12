import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../../src/helpers/concurrency.js';

describe('mapWithConcurrency', () => {
  it('maps items preserving order', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, async (x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('returns empty array for empty input', async () => {
    const result = await mapWithConcurrency([], 5, async (x) => x);
    expect(result).toEqual([]);
  });

  it('throws on concurrency < 1', async () => {
    await expect(mapWithConcurrency([1], 0, async (x) => x)).rejects.toThrow(
      'concurrency must be >= 1',
    );
  });

  it('limits concurrency to items.length when concurrency > items', async () => {
    const running: number[] = [];
    let maxConcurrent = 0;

    const result = await mapWithConcurrency([1, 2, 3], 10, async (x) => {
      running.push(x);
      maxConcurrent = Math.max(maxConcurrent, running.length);
      await new Promise((r) => setTimeout(r, 10));
      running.splice(running.indexOf(x), 1);
      return x;
    });

    expect(result).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('respects concurrency limit', async () => {
    const running: number[] = [];
    let maxConcurrent = 0;

    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (x) => {
      running.push(x);
      maxConcurrent = Math.max(maxConcurrent, running.length);
      await new Promise((r) => setTimeout(r, 10));
      running.splice(running.indexOf(x), 1);
      return x * 10;
    });

    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('propagates first rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error('boom');
        return x;
      }),
    ).rejects.toThrow('boom');
  });

  it('passes index to mapper', async () => {
    const indices: number[] = [];
    await mapWithConcurrency(['a', 'b', 'c'], 2, async (_item, i) => {
      indices.push(i);
    });
    expect(indices.sort()).toEqual([0, 1, 2]);
  });
});
