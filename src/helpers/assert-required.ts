/**
 * Throws if any of the required fields are undefined or null in the decoded object.
 */
export function assertRequiredFields(
  decoded: Record<string, any>,
  fields: string[],
  prefix: string,
): void {
  for (const key of fields) {
    if (decoded[key] === undefined || decoded[key] === null) {
      throw new Error(`${prefix}: missing required field "${key}"`);
    }
  }
}
