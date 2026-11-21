/** Largest instant Postgres, JS and Carbon all parse: 9999-12-31T23:59:59Z. */
const MAX_EXPIRY_SECONDS = 253402300799;

/**
 * Expiry date from the contract's int64 `expirationTime` (unix seconds). The
 * contract accepts any value after the current time, so larger values are
 * clamped to a date the database can store.
 */
export function expiryDate(seconds: unknown): Date {
  return new Date(Math.min(Number(seconds), MAX_EXPIRY_SECONDS) * 1000);
}
