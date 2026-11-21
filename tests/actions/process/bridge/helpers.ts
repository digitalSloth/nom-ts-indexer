/**
 * Builders the handler created for a table, in call order. Each builder
 * records the chained calls (`insert`, `update`, `where`, ...) made on it.
 */
export function buildersFor(tx: any, table: string): any[] {
  return tx.mock.calls
    .map((call: any[], i: number) => [call[0], tx.mock.results[i].value])
    .filter(([name]: [string]) => name === table)
    .map(([, builder]: [string, any]) => builder);
}

/** The first argument of every `method` call made on a table's builders. */
export function argsFor(tx: any, table: string, method: string): any[] {
  return buildersFor(tx, table).flatMap((b) => b[method].mock.calls.map((c: any[]) => c[0]));
}
