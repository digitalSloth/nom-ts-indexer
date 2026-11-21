/** Decoded hash and bytes args arrive as 0x-prefixed hex; rows store bare lower-case hex. */
export function bareHex(value: unknown): string {
  return String(value).replace(/^0x/i, '').toLowerCase();
}
