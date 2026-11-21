/**
 * Run an async mapper across `items` with a maximum concurrency.
 * Preserves input order in the returned array. Throws on the first rejection.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (concurrency < 1) {
    throw new Error('concurrency must be >= 1');
  }
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
